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
      const opportunities = await this.getOppurtunities(email,accessToken,"hie")
      // Prepare OpenAI prompt
      const finalPrompt = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: transcript },
        { role: "user", content : opportunities}
      ];

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
      "https://external-api.example.com/signin",
      { email, accessToken },
      { withCredentials: true }
    );
    this.cookies = res.headers["set-cookie"] || null;
    if (!this.cookies) throw new Error("No cookies returned from sign-in to sales helper")
    console.log("✅ Signed in successfully");
    const formData = new FormData();
    formData.append("body", JSON.stringify({ message: prompt }));

    const session:AxiosResponse = await axios.post(
      "https://kmhub.cprime.com/v1/agent/session",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Cookie: this.cookies.join("; "),
        },
        withCredentials : true,
      }
    );
    
    const eventSource =  new (EventSource as any)(`https://kmhub.cprime.com/v1/agent/${session.data}`,{
      headers: {
        Cookie: this.cookies.join(";")
      },
    }
    );

    return new Promise((resolve,reject)=> {
      const collected = {messages:[] as string[], references:[] as any [] };
    

      eventSource.addEventListener("message", (event:MessageEvent) => {
            
            collected.messages.push(event.data);
          });
      eventSource.addEventListener("references", (event: MessageEvent) => {
          console.log("🔗 references:", event.data);
          try {
            collected.references.push(JSON.parse(event.data));
          } catch {
            collected.references.push(event.data);
          }});
        eventSource.addEventListener("complete", () => {
          console.log("🏁 Received 'complete' event — closing stream.");
          eventSource.close();
          const finalOutput = [
          "💬 Messages:",
          collected.messages.join("\n"),
          collected.references.length
            ? `\n🔗 References:\n${JSON.stringify(collected.references, null, 2)}`
            : "",
        ].join("\n");

        resolve(finalOutput.trim());
        });
        eventSource.onerror = (err:any) => {
          console.error("❌ SSE error or connection closed:", err);
          eventSource.close();
          // resolve with partial data to avoid hanging
        };
      })
  } catch(error: any) {
    console.error("❌ Error in getOppurtunities:", error.response?.data || error.message);
    throw new Error("Failed to fetch opportunities");
  }
}

}