// server.cjs (at the very top)
require("dotenv").config();       // ← load .env

const express = require("express");
const cors    = require("cors");
const axios   = require("axios");

const app  = express();
const port = 5000;

app.use(cors());
app.use(express.json());

app.post("/generate-test-cases", async (req, res) => {
  const userInput = req.body.input;
  try {
    const aiResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are a QA expert. Generate Gherkin-style test cases." },
          { role: "user",   content: userInput }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,  // ← updated here
          "Content-Type": "application/json"
        }
      }
    );
    res.json({ output: aiResponse.data.choices[0].message.content });
  } catch (err) {
    console.error("OpenAI call failed:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to generate test cases" });
  }
});

app.listen(port, () => console.log(`✅ Server running at http://localhost:${port}`));
