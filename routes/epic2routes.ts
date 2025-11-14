import multer from "multer";
import { Epic2Service } from "../services/epic2Service.js";
import express from "express";
const epic2Router = express.Router();
const upload = multer({ dest: "uploads/" });
import cookieParser from "cookie-parser";
import {prisma} from  "../prisma/lib/client.js"
epic2Router.post("/analyze-transcript", upload.single("file"), async (req, res) => {
  try {
    const {userId, email} = (req as any ).user
    const user = await prisma.user.findUnique({
      where: {email},
      select : {accessToken :true}
    })
    if (!user.accessToken){
      throw new Error(`User not found for email: ${email}`);
    }

    const result = await Epic2Service.analyzeTranscript(req.file!,userId,user?.accessToken,email);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

epic2Router.post("/chat", async (req, res) => {
  const { session_id, message } = req.body;
  try {
    const result = await Epic2Service.handleChat(session_id, message);
    res.status(200).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});



export default epic2Router;