const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const app = express();
app.use(express.static("public"));
app.use(express.json());

// ======================
// אחסון הקבצים
// ======================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ======================
// בדיקה בסיסית ל-GOOGLE_API_KEY
// ======================
if (!process.env.GOOGLE_API_KEY) {
  console.warn(
    "WARNING: GOOGLE_API_KEY not set in .env file. Enabling fake analysis mode."
  );
  process.env.USE_FAKE_ANALYSIS = process.env.USE_FAKE_ANALYSIS || "1";
}

// Ensure uploads directory exists
if (!fs.existsSync(path.join(__dirname, "uploads"))) {
  fs.mkdirSync(path.join(__dirname, "uploads"), { recursive: true });
}

// ======================
// ניתוח אודיו
// ======================
app.post("/analyze", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      if (process.env.USE_FAKE_ANALYSIS === "1") {
        console.log(
          "No file uploaded but fake mode active — returning dummy analysis"
        );
        const fake = {
          topic: "דוגמה: פודקאסט על טכנולוגיה",
          mood: "energetic",
          genre: "technology",
          audience: "Developers and tech enthusiasts",
          keywords: ["tech", "ai", "dev"],
        };
        return res.json({ success: true, analysis: fake });
      }
      return res
        .status(400)
        .json({ success: false, error: "File not received" });
    }

    console.log("Received file:", req.file.originalname);

    const audioBytes = fs.readFileSync(req.file.path);

    const prompt = `
Analyze this audio file and provide:
1. Main topic/content (2-3 sentences)
2. Mood (energetic/calm/melancholic/happy)
3. Genre (technology/business/entertainment/news)
4. Target audience
5. 3-5 keywords

Format as JSON.
`;

    // Validate MIME type and use the real one when sending to the model
    const allowedAudioTypes = [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/x-wav",
      "audio/mp4",
      "audio/x-m4a",
      "audio/aac",
      "audio/ogg",
      "audio/webm",
    ];
    const mimeType = req.file.mimetype || "audio/mpeg";
    console.log("Received file mimetype:", mimeType, "path:", req.file.path);

    // If fake-analysis mode is active, return immediately (useful for development)
    if (process.env.USE_FAKE_ANALYSIS === "1") {
      console.log(
        "USE_FAKE_ANALYSIS=1 active — returning dummy analysis (ignoring MIME type)"
      );
      const fake = {
        topic: "דוגמה: פודקאסט על טכנולוגיה",
        mood: "energetic",
        genre: "technology",
        audience: "Developers and tech enthusiasts",
        keywords: ["tech", "ai", "dev"],
      };
      return res.json({ success: true, analysis: fake });
    }

    // Accept some video containers that actually contain audio (e.g., .mp4 files)
    let sendMime = mimeType;
    if (mimeType.startsWith("video/")) {
      console.log(
        "Uploaded file is a video type. Attempting to treat as audio for processing.",
        mimeType
      );
      // Map common video/mp4 to audio/mp4 for downstream processing
      if (mimeType.includes("mp4") || mimeType.includes("x-m4v")) {
        sendMime = "audio/mp4";
      }
    }

    if (
      !sendMime.startsWith("audio/") &&
      !allowedAudioTypes.includes(sendMime)
    ) {
      return res.status(400).json({
        success: false,
        error: "Unsupported file type",
        mimeType: mimeType,
      });
    }

    console.log(
      "Sending audio to model, bytes:",
      audioBytes.length,
      "mime sent:",
      sendMime
    );

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: sendMime,
          data: audioBytes.toString("base64"),
        },
      },
      { text: prompt },
    ]);

    // Be defensive about the shape of the response from the client library
    let text = "";
    try {
      if (
        result &&
        result.response &&
        typeof result.response.text === "function"
      ) {
        text = result.response.text();
      } else if (result && typeof result.text === "function") {
        text = result.text();
      } else if (typeof result === "string") {
        text = result;
      } else if (result && result.output && Array.isArray(result.output)) {
        text = result.output
          .map((o) => o.content || o.text || JSON.stringify(o))
          .join("\n");
      } else {
        text = JSON.stringify(result);
      }

      try {
        text = JSON.parse(text);
      } catch (err) {
        console.error("Invalid JSON from model. Raw response:", text);
        return res
          .status(500)
          .json({ success: false, error: "Invalid JSON response", raw: text });
      }
    } catch (err) {
      console.error("Error processing model response:", err);
      return res.status(500).json({
        success: false,
        error: "Model response handling failed",
        details: err.stack || err.message,
      });
    }

    res.json({ success: true, analysis: text });
  } catch (err) {
    console.error("Analyze error:", err);
    res
      .status(500)
      .json({ success: false, error: "Server error", details: err.message });
  }
});

// ======================
// יצירת תמונות Cover
// ======================
app.post("/generate-covers", async (req, res) => {
  try {
    const { topic, mood, genre, audience, keywords } = req.body;
    if (!topic)
      return res
        .status(400)
        .json({ success: false, error: "Missing analysis data" });

    // If in fake mode (no API key), return sample placeholder covers so UI can continue working
    if (process.env.USE_FAKE_ANALYSIS === "1") {
      console.log("USE_FAKE_ANALYSIS=1 active — returning fake covers");
      const placeholder =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";
      const fakeCovers = [
        { title: "מינימליסטי ומקצועי", image: placeholder },
        { title: "צבעוני ואנרגטי", image: placeholder },
        { title: "אומנותי ויצירתי", image: placeholder },
      ];
      return res.json({ success: true, covers: fakeCovers });
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const imageModel = genAI.getGenerativeModel({
      model: "gemini-3-pro-image-preview",
    });

    const prompts = [
      {
        title: "מינימליסטי ומקצועי",
        prompt: `Create a 1:1 2K professional minimalistic podcast cover. Topic: ${topic}, Mood: ${mood}, Genre: ${genre}, Audience: ${audience}, Keywords: ${keywords.join(
          ", "
        )}`,
      },
      {
        title: "צבעוני ואנרגטי",
        prompt: `Create a 1:1 2K colorful and energetic podcast cover. Topic: ${topic}, Mood: ${mood}, Genre: ${genre}, Audience: ${audience}`,
      },
      {
        title: "אומנותי ויצירתי",
        prompt: `Create a 1:1 2K artistic and creative podcast cover inspired by ${topic}`,
      },
      {
        title: "מותאם לז'אנר",
        prompt: `Create a 1:1 2K cover according to genre: ${genre}, Mood: ${mood}, Keywords: ${keywords.join(
          ", "
        )}`,
      },
    ];

    const results = [];
    for (const p of prompts) {
      try {
        const img = await imageModel.generateImage({
          prompt: p.prompt,
          size: "2048x2048",
        });
        const base64 = img.data[0].b64_json;
        results.push({ title: p.title, image: base64 });
      } catch (imgErr) {
        console.error(
          `Error generating image for prompt "${p.title}":`,
          imgErr
        );
      }
    }

    if (results.length === 0)
      return res
        .status(500)
        .json({ success: false, error: "No images generated" });
    res.json({ success: true, covers: results });
  } catch (err) {
    console.error("Generate covers error:", err);
    res.status(500).json({
      success: false,
      error: "Image generation failed",
      details: err.message,
    });
  }
});

// ======================
// הפעלת השרת
// ======================
const PORT = 3000;
app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
