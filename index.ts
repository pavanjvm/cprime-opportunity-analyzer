import express, { type Request, type Response } from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import multer from "multer";
import { readFile, unlink } from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import { PrismaClient } from "./generated/prisma/client.js";
import { PDFParse } from 'pdf-parse';
import mammoth from "mammoth";
import { SYSTEM_PROMPT } from "./systemprompt.js";
import { chatPrompt } from "./chatprompts.js";
import { knowledge } from "./knowledge.js";

import cookieParser from "cookie-parser";
import authRouter from "./routes/auth.js";
dotenv.config();
const app = express();
const port = 3000;

app.use(express.json());

const prisma = new PrismaClient();
const upload = multer({ dest: "uploads/" });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


interface ChatRequest {
  message: string;
  session_id: string;
}

interface ChatResponse {
  reply: string;          // The bot's message
  session_id: string;     // To link to a chat session
  timestamp: string;      // ISO string timestamp
}
 
app.use('/auth',authRouter)
app.post("/analyze-transcript", upload.single("file"), async (req: Request, res:Response)=> {
  // console.log("Headers:", req.headers);
  // console.log("File:", req.file);

  if (!req.file) {
    return res.status(400).json({ error: "Missing file in request" });
  }
  const fileName = req.file.originalname;

  const filePath = req.file.path;
  console.log(filePath)
  const fileType = req.file.mimetype;
  // console.log(filePath,fileType)
  let transcript = "";

  try {
    // 🧾 Extract text based on file type
    if (fileType === "application/pdf") {
      
      const buffer = await readFile(filePath);

      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      transcript = result.text
      console.log("the transcript :",transcript)
    } else if (
      fileType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const data = await readFile(filePath);
      const result = await mammoth.extractRawText({ buffer: data });
      transcript = result.value;
      console.log(transcript);
    } else {
      return res.status(415).json({ error: "Unsupported file type. Upload a PDF or DOCX." });
    }

    // Insert transcript into system prompt
    const finalPrompt = [{"role":"system","content":SYSTEM_PROMPT},
      {"role":"user","content":transcript}
    ];
    
    
    // 🔮 Call OpenAI
    const response = await openai.responses.create({
      model: "gpt-5",
      input: finalPrompt as any,
    });

    const outputText = response.output_text;
    const session = await prisma.session.create({
      data: {
        fileName: fileName,
        summary: outputText 
      },
    });
    
    
    // ✅ Return response
    res.status(201).json({
      message: "summarised successfully",
      session_id: session.id,
      output : outputText
    }
      );
    await prisma.chatMessage.createMany({
      data:[
        {sessionId: session.id, role: "system",content : chatPrompt},
        {sessionId: session.id, role: "user",content :`here is the trancript : ${transcript}`},
        {sessionId: session.id, role: "user",content : `here is the analysis : ${outputText}`},
        {sessionId: session.id, role: "user",content : `here is the organization's knoweledge : ${knowledge}`},
        

      ]
    }).catch(err => console.error('DB write failed:', err));
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Failed to analyze transcript" });
  } finally {
    try {
    await unlink(filePath).catch(() => {});;
    console.log(`🧹 Deleted uploaded file: ${filePath}`);
  } catch (cleanupErr) {
    console.error("Failed to delete uploaded file:", cleanupErr);
  }
  }
});

app.post("/chat",async(req: Request<{}, ChatResponse, ChatRequest>,res:Response) =>{
  const message = req.body.message;
  const session_id = req.body.session_id;
  const session = await prisma.session.findUnique({
    where: { id: session_id },
    include: { chatHistory: true },
  });
  if (!session) {
  // handle missing session
    return res.status(404).json({ error: "Session not found" });
  }
  const chatcontext = [...session.chatHistory.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    { role: "user", content: message },]
  
  
    const response = await openai.responses.create({
      model: "gpt-5",
      input: chatcontext as any

    })
    
    const assistant_message = response.output_text

    res.status(200).json(
      { message :assistant_message }
    )

    await prisma.chatMessage.createMany({
      data : [{
        sessionId:session_id,
        role:"user",
        content: message
      },{
        sessionId: session_id,
        role : "assistant",
        content: assistant_message
      }]
    }).catch(err => console.error('DB write failed:', err));

})

app.use(cookieParser());


// Routes

app.listen(port, () => {
  console.log(`✅ CprimeGPT-5 Analyzer running at http://localhost:${port}`);
});
