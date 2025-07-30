const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const OpenAI = require('openai');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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
    console.error('Error generating test cases:', error.message);
    res.status(500).json({ error: 'Failed to generate test cases' });
  }
});

app.get('/', (req, res) => res.send('Backend is running!'));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
