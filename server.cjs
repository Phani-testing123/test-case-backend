const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const OpenAI = require('openai');
// --- NEW: Import the Google Generative AI library ---
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Initialize OpenAI (Your existing code)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// --- NEW: Initialize the Gemini client ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Your existing OpenAI endpoint
app.post('/generate-test-cases', async (req, res) => {
  try {
    const { input } = req.body;
    if (!input) return res.status(400).json({ error: 'Input is required' });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-1106-preview',
      messages: [{
        role: 'user',
        content: `Generate test cases in plain text based on the following requirement:\n${input}`
      }]
    });

    const result = completion.choices[0]?.message?.content || 'No response';
    res.json({ output: result });
  } catch (error) {
    console.error('Error generating test cases:', error.message);
    res.status(500).json({ error: 'Failed to generate test cases' });
  }
});

// --- NEW: Add the Gemini endpoint ---
app.post('/generate-gemini-test-cases', async (req, res) => {
  try {
    const { input } = req.body;
    if (!input) return res.status(400).json({ error: 'Input is required' });

    // Select the Gemini model you want to use
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

    // Generate content from the prompt
    const result = await model.generateContent(input);
    const response = result.response;
    const text = response.text();
    
    // Send back the response in the same format as your OpenAI endpoint
    res.json({ output: text });
  } catch (error) {
    console.error('Gemini Error:', error.message);
    res.status(500).json({ error: 'Failed to generate test cases from Gemini' });
  }
});


app.get('/', (req, res) => res.send('Backend is running!'));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));