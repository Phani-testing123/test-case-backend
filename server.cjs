// server.cjs

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
// --- NEW: Import Azure OpenAI library ---
const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");

const app = express();
app.use(cors());
app.use(express.json());

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- Your existing OpenAI endpoint ---
app.post('/generate-test-cases', async (req, res) => {
  // ... (your existing openai logic)
});

// --- Your existing Gemini endpoint ---
app.post('/generate-gemini-test-cases', async (req, res) => {
  // ... (your existing gemini logic)
});

// --- NEW: Define the Copilot (Azure OpenAI) Endpoint ---
app.post('/generate-copilot-test-cases', async (req, res) => {
  try {
    const { input } = req.body;
    if (!input) return res.status(400).json({ error: 'Input is required' });

    // Initialize Azure OpenAI Client
    const client = new OpenAIClient(
      process.env.AZURE_OPENAI_ENDPOINT,
      new AzureKeyCredential(process.env.AZURE_OPENAI_KEY)
    );

    const { choices } = await client.getChatCompletions(
      process.env.AZURE_OPENAI_DEPLOYMENT_NAME, // This is your model deployment name
      [{ role: "user", content: input }]
    );

    res.json({ output: choices[0]?.message?.content || "" });
  } catch (error) {
    console.error('Copilot (Azure OpenAI) Error:', error);
    res.status(500).json({ error: 'Failed to generate from Copilot' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));