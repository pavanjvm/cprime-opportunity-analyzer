import { readFile, unlink } from "fs/promises";
import { PrismaClient } from "../generated/prisma/client.js";
import { SYSTEM_PROMPT } from "../systemprompt.js";
import OpenAI from "openai";
import { PDFParse } from 'pdf-parse';
import mammoth from "mammoth";
import { chatPrompt } from "../chatprompts.js";
import { knowledge } from "../knowledge.js";
const prisma = new PrismaClient();


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class Epic2Service {
  /**
   * 🧾 Analyze a transcript (PDF/DOCX), summarize, and start a session
   */
  static async analyzeTranscript(file: Express.Multer.File) {
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

      // 2️⃣ Prepare OpenAI prompt
      const finalPrompt = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: transcript },
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
}