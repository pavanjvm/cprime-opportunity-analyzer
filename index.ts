import express, { type Request, type Response } from "express";
import dotenv from "dotenv";
dotenv.config();
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
import { authMiddleware } from './auth/authMiddleware.js'

import cookieParser from "cookie-parser";
import authRouter from "./routes/auth.js";
import epic2Router from "./routes/epic2routes.js";

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
 
app.use('/auth',cookieParser(),authRouter)
app.use('/epic2',cookieParser(),authMiddleware,epic2Router)

app.listen(port, () => {
  console.log(`✅ CprimeGPT-5 Analyzer running at http://localhost:${port}`);
});
