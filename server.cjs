const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
// --- NEW: Import the Anthropic (Claude) library ---
const Anthropic = require('@anthropic-ai/sdk');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Initialize OpenAI (Your existing code)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Initialize Gemini (Your existing code)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- NEW: Initialize the Anthropic (Claude) client ---
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});


// Your existing OpenAI endpoint
app.post('/generate-test-cases', async (req, res) => {
  try {
    const { input } = req.body;
    if (!input) return res.status(400).json({ error: 'Input is required' });

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{
        role: 'user',
        content: `Generate test cases in plain text based on the following requirement:\n${input}`
      }]
    });

    const result = completion.choices[0]?.message?.content || 'No response';
    res.json({ output: result });
  } catch (error) {
    console.error('OpenAI Error:', error.message);
    res.status(500).json({ error: 'Failed to generate test cases from OpenAI' });
  }
});

// Your existing Gemini endpoint
app.post('/generate-gemini-test-cases', async (req, res) => {
  try {
    const { input } = req.body;
    if (!input) return res.status(400).json({ error: 'Input is required' });

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
    const result = await model.generateContent(input);
    const response = result.response;
    const text = response.text();
    
    res.json({ output: text });
  } catch (error) {
    console.error('Gemini Error:', error.message);
    res.status(500).json({ error: 'Failed to generate test cases from Gemini' });
  }
});

// --- NEW: Add the Anthropic (Claude) endpoint ---
app.post('/generate-claude-test-cases', async (req, res) => {
  try {
    const { input } = req.body;
    if (!input) return res.status(400).json({ error: 'Input is required' });

    const msg = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620", // The latest and most powerful model
      max_tokens: 4096,
      messages: [{ role: "user", content: input }],
    });

    const result = msg.content[0]?.text || 'No response';
    res.json({ output: result });
  } catch (error) {
    console.error('Claude Error:', error.message);
    res.status(500).json({ error: 'Failed to generate test cases from Claude' });
  }
});


app.get('/', (req, res) => res.send('Backend is running!'));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));