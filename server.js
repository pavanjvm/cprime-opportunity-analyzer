const express = require("express");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const multer  = require('multer')
const upload = multer({ dest: 'uploads/' })
const { readFile } = require('fs').promises;
const { unlink } = require('fs').promises;
const fs = require("fs");


const { PDFParse } = require('pdf-parse');
const mammoth = require("mammoth");
const { SYSTEM_PROMPT } = require("./systemprompt.js");

dotenv.config();
const app = express();
const port = 3000;

app.use(express.json());



// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 🧠 Analyze uploaded file (PDF or Word)
app.post("/analyze-transcript", upload.single("file"), async (req, res) => {
  // console.log("Headers:", req.headers);
  // console.log("File:", req.file);

  if (!req.file) {
    return res.status(400).json({ error: "Missing file in request" });
  }

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
      return res.status(400).json({ error: "Unsupported file type. Upload a PDF or DOCX." });
    }

    // Insert transcript into system prompt
    const finalPrompt = SYSTEM_PROMPT.replace("[INSERT TRANSCRIPT HERE]", transcript);

    // 🔮 Call OpenAI
    const response = await openai.responses.create({
      model: "gpt-5",
      input: finalPrompt,
    });

    const outputText = response.output_text

    // Try to parse JSON output
    let parsedOutput;
    try {
      parsedOutput = JSON.parse(outputText);
    } catch {
      parsedOutput = { analysis: outputText };
    }

    // ✅ Return response
    res.json(parsedOutput);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Failed to analyze transcript" });
  } finally {
    try {
    await unlink(filePath);
    console.log(`🧹 Deleted uploaded file: ${filePath}`);
  } catch (cleanupErr) {
    console.error("Failed to delete uploaded file:", cleanupErr);
  }
  }
});

app.post("/test-upload", upload.single("file"), (req, res) => {
  console.log("Headers:", req.headers);
  console.log("File:", req.file);

  if (!req.file) {
    return res.status(400).send("No file received");
  }
  console.log("File info:", req.file);
  res.json({ message: "File received successfully!" });
});


app.listen(port, () => {
  console.log(`✅ CprimeGPT-5 Analyzer running at http://localhost:${port}`);
});
