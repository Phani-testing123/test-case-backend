const express = require('express');
const { Queue, Job } = require('bullmq');
const cors = require('cors');
const dotenv = require('dotenv');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Anthropic = require('@anthropic-ai/sdk');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ---> ADD THE CORS CONFIGURATION RIGHT AFTER `const app = express();` <---
const corsOptions = {
  // This is the URL of your frontend application.
  // The backend will now allow requests ONLY from this origin.
  origin: 'https://test-case-generator-one.vercel.app' 
};
app.use(cors(corsOptions));

app.use(express.json());


const queueConnection = { connection: process.env.REDIS_URL };

const signupQueue = new Queue('signup-jobs', queueConnection);

// MODIFIED ENDPOINT: Now returns the Job ID
app.post('/signup-agent', async (req, res) => {
  const { count } = req.body;
  if (!count || typeof count !== 'number' || count < 1) {
    return res.status(400).json({ error: 'A valid "count" number is required.' });
  }

  const job = await signupQueue.add('create-accounts-job', { countToCreate: count });

  // Respond with the job ID so the frontend can track it.
  res.status(202).json({ jobId: job.id });
});


// NEW ENDPOINT: To check the status of a job
app.get('/job-status/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const job = await signupQueue.getJob(jobId);

  if (!job) {
    return res.status(404).json({ status: 'not found' });
  }

  const status = await job.getState();
  const returnValue = job.returnvalue; // The result from the worker

  res.json({ status, result: returnValue });
});


// --- Model initializations ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });



// --- Playwright AI Code ---
app.post('/ai-generate-playwright', async (req, res) => {
  try {
    const { scenario } = req.body;
    if (!scenario) return res.status(400).json({ error: 'Scenario is required' });

    const prompt = `
You are a senior Playwright automation engineer. Convert the following Gherkin scenario into a Playwright test function in JavaScript. For steps where the selector or page isn't clear, add a TODO comment.

Gherkin Scenario:
${scenario}

Only output the code for the Playwright test function. Do not explain your answer.
    `;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // Or gpt-3.5-turbo if you wish
      messages: [{ role: 'user', content: prompt }]
    });

    const code = completion.choices[0]?.message?.content || 'No code generated.';
    res.json({ code });
  } catch (error) {
    console.error('Playwright AI Error:', error.message);
    res.status(500).json({ error: 'Failed to generate Playwright code' });
  }
});

// --- OpenAI ---
app.post('/generate-test-cases', async (req, res) => {
  try {
    const { input } = req.body;
    if (!input) return res.status(400).json({ error: 'Input is required' });

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{
        role: 'user',
        content: input
      }]
    });

    const result = completion.choices[0]?.message?.content || 'No response';
    res.json({ output: result });
  } catch (error) {
    console.error('OpenAI Error:', error.message);
    res.status(500).json({ error: 'Failed to generate test cases from OpenAI' });
  }
});

// --- Gemini ---
app.post('/generate-gemini-test-cases', async (req, res) => {
  try {
    const { input } = req.body;
    if (!input) return res.status(400).json({ error: 'Input is required' });

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
    const result = await model.generateContent(input);
    const text = result.response.text();
    res.json({ output: text });
  } catch (error) {
    console.error('Gemini Error:', error.message);
    res.status(500).json({ error: 'Failed to generate test cases from Gemini' });
  }
});

// --- Claude ---
app.post('/generate-claude-test-cases', async (req, res) => {
  try {
    const { input } = req.body;
    if (!input) return res.status(400).json({ error: 'Input is required' });

    const msg = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
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
