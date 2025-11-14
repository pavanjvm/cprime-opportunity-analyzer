import { readFile, unlink } from "fs/promises";
import { PrismaClient } from "../generated/prisma/client.js";
import { SYSTEM_PROMPT } from "../systemprompt.js";
import FormData from "form-data"; 
import OpenAI from "openai";
import { PDFParse } from 'pdf-parse';
import mammoth from "mammoth";
import { chatPrompt } from "../chatprompts.js";
import { knowledge } from "../knowledge.js";
import type{ AxiosResponse } from "axios";
import axios from "axios";
import { error } from "console";
import {EventSource} from "eventsource";
import { resolve } from "path";
import { rejects } from "assert";

const prisma = new PrismaClient();


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class Epic2Service {
  /**
   *
   * 🧾 Analyze a transcript (PDF/DOCX), summarize, and start a session
   */
  private static cookies: string[] | null = null;
 

  static async analyzeTranscript(file: Express.Multer.File,userId:String,accessToken:String,email:String) {
    console.log("control reached here")
    if (!file) throw new Error("Missing file in request");

    const filePath = file.path;
    const fileType = file.mimetype;
    const fileName = file.originalname;

    let transcript = "";

    try {
      // 1️⃣ Extract text from uploaded file
      if (fileType === "application/pdf") {
        const buffer = await readFile(filePath);
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        transcript = result.text;
      } else if (
        fileType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        const data = await readFile(filePath);
        const result = await mammoth.extractRawText({ buffer: data });
        transcript = result.value;
      } else {
        throw new Error("Unsupported file type. Upload a PDF or DOCX.");
      }
      const opp_prompt = `You are an enterprise solutions strategist specializing in identifying business opportunities based on transcripts of client conversations. I will provide you with a transcript from a client or prospect meeting.

        Your tasks are:

        Identify Opportunities:

        Extract specific business challenges, goals, and needs mentioned in the transcript.

        Map these opportunities to relevant Cprime services and capabilities

        Cross-Reference with Past Successes:

        Use known Cprime case studies, sales data, and project examples to find similar opportunities from the past.

        Summarize what Cprime did in those cases (approach, solutions, client outcomes, KPIs).

        Highlight patterns in successful deals—such as entry points, messaging that resonated, or the services that led to expansion.

        Generate Insights and Recommendations:

        Provide a strategic analysis on how to approach this client based on similar historical engagements.

        Suggest key value propositions, potential upsells, and differentiators.

        Include examples of how Cprime framed or delivered similar value in past opportunities.

        Outline a possible follow-up plan (e.g., discovery workshop, capability presentation, PoC).

        Transcript : ${transcript}`
      const opportunities = await this.getOppurtunities(email,accessToken,opp_prompt)
      
      // Prepare OpenAI prompt
      const finalPrompt = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: transcript },
        { role: "user", content : opportunities}
      ];
      console.log("cooking report")
      console.log("opppurtunities are",opportunities)
       
      // 3️⃣ Get summary/analysis from OpenAI
      const response = await openai.responses.create({
        model: "gpt-5",
        input: finalPrompt as any
      });

      const outputText = response.output_text;

      // 4️⃣ Create a new session in DB
      const session = await prisma.session.create({
        data: {
          fileName,
          summary: outputText,
        },
      });

      // 5️⃣ Save chat messages (system, transcript, analysis)
      await prisma.chatMessage.createMany({
        data: [
          { sessionId: session.id, role: "system", content: SYSTEM_PROMPT },
          { sessionId: session.id, role: "user", content: `Transcript: ${transcript}` },
          { sessionId: session.id, role: "user", content: opportunities },
          
          { sessionId: session.id, role: "assistant", content: outputText },
        ],
      });

      return {
        message: "Summarized successfully",
        session_id: session.id,
        output: outputText,
      };
    } finally {
      await unlink(filePath).catch(() => {});
    }
  }

  /**
   * 💬 Continue a chat within an existing session
   */
  static async handleChat(session_id: string, message: string) {
    const session = await prisma.session.findUnique({
      where: { id: session_id },
      include: { chatHistory: true },
    });

    if (!session) throw new Error("Session not found");

    // Build conversation context
    const chatContext = [
      ...session.chatHistory.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user", content: message },
    ];

    // Generate AI response
    const response = await openai.responses.create({
      model: "gpt-5",
      input: chatContext as any,
    });

    const assistant_message = response.output_text;

    // Persist chat messages
    await prisma.chatMessage.createMany({
      data: [
        { sessionId: session_id, role: "user", content: message },
        { sessionId: session_id, role: "assistant", content: assistant_message },
      ],
    });

    return { message: assistant_message };
  }

  // static async getPastmeetings(userId){
  //   // const userId = (req as any ).userId
  //   const user = await prisma.user.findUnique({
  //     where: { id: userId },
  //     select: { accessToken: true },
  //   });

  static async getOppurtunities(email:String,accessToken:String, prompt:String):Promise<string>{
    try{
    const res: AxiosResponse = await axios.post(
      "https://api.kmhub.cprime.com/v1/sign-in",
      { email, accessToken },
      { withCredentials: true }
    );
    this.cookies = res.headers["set-cookie"] || null;
    if (!this.cookies) throw new Error("No cookies returned from sign-in to sales helper")
    console.log("✅ Signed in successfully");
    const formData = new FormData();
    formData.append("body", JSON.stringify({ message: prompt }));

    const session:AxiosResponse = await axios.post(
      "https://api.kmhub.cprime.com/v1/agent/session",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Cookie: this.cookies.join("; "),
        },
        withCredentials : true,
      }
    );
    console.log("sessiondata is " ,session.data.data)
    console.log(this.cookies)
    const response = await axios.get(
  `https://api.kmhub.cprime.com/v1/agent/${session.data.data}`,
  {
    headers: {
      Cookie: this.cookies.join("; "),
    },
    responseType: 'stream',
  }
);
    
return new Promise((resolve, reject) => {
  const collected = {
    messages: [] as string[],
    references: [] as any[],
  };

  let buffer = ""; // Buffer for incomplete lines
  let currentEvent = ""; // Track current event type

  // Handle incoming data chunks
  response.data.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");

    // Keep the last incomplete line in buffer
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith(":")) continue; // Skip empty lines/comments

      if (trimmedLine.startsWith("event:")) {
        currentEvent = trimmedLine.substring(6).trim();
        console.log(`📌 Event type: ${currentEvent}`);
        continue;
      }

      if (trimmedLine.startsWith("data:")) {
        const data = trimmedLine.substring(5).trim();

        try {
          const parsedData = JSON.parse(data);

          if (currentEvent === "message") {
            collected.messages.push(parsedData.message || parsedData.content || parsedData);
            console.log("💬 Message:", parsedData.message || parsedData.content || parsedData);
          } else if (currentEvent === "references") {
            collected.references.push(parsedData);
            console.log("🔗 References:", parsedData);
          }
        } catch {
          // Plain text data
          if (currentEvent === "message") {
            collected.messages.push(data);
            console.log("💬 Message:", data);
          } else if (currentEvent === "references") {
            collected.references.push(data);
            console.log("🔗 References:", data);
          }
        }

        // Resolve immediately on complete/DONE
        if (data === "complete" || data === "[DONE]") {
          console.log("🏁 Stream complete");
          const result = {
            messages: collected.messages.join("\n"),
            references: collected.references
          };
          resolve(JSON.stringify(result, null, 2));
        }
      }
    }
  });

  // Handle stream end as a fallback
  response.data.on("end", () => {
    if (buffer.trim()) {
      // Process any remaining buffered line
      const trimmedLine = buffer.trim();
      if (trimmedLine.startsWith("data:")) {
        const data = trimmedLine.substring(5).trim();
        collected.messages.push(data);
      }
    }

    console.log("✅ Stream ended (fallback)");
    const result = {
      messages: collected.messages.join("\n"),
      references: collected.references
    };
    resolve(JSON.stringify(result, null, 2));
  });

  // Handle errors
  response.data.on("error", (err: any) => {
    console.error("❌ Stream error:", err);

    if (collected.messages.length > 0 || collected.references.length > 0) {
      const result = {
        messages: collected.messages.join("\n"),
        references: collected.references
      };
      resolve(JSON.stringify(result, null, 2));
    } else {
      reject(new Error(`Stream error: ${err.message}`));
    }
  });
});


}catch(error: any) {
    console.error("❌ Error in getOppurtunities:", error.response?.data || error.message);
    throw new Error("Failed to fetch opportunities");
  }
}

}