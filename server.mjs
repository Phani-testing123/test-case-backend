import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import OpenAI from 'openai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Middleware
app.use(cors({
  origin: 'https://test-case-generator-one.vercel.app',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));
app.use(express.json());

// ✅ OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ✅ Route for generating test cases
app.post('/generate-test-cases', async (req, res) => {
  try {
    const { input } = req.body;

    if (!input) {
      return res.status(400).json({ error: 'Input is required' });
    }

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
    console.error('Error generating test cases:', error.message);
    res.status(500).json({ error: 'Failed to generate test cases' });
  }
});

// ✅ Optional health check
app.get('/', (req, res) => {
  res.send('Backend is running!');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});