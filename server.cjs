/* =============================================
   |            IMPORTS & SETUP                |
   ============================================= */
const express = require('express');
const { Queue } = require('bullmq');
const cors = require('cors');
const dotenv = require('dotenv');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Anthropic = require('@anthropic-ai/sdk');
const IORedis = require('ioredis');

const { Pinecone } = require('@pinecone-database/pinecone');
const { Document } = require('@langchain/core/documents'); 
const { OpenAIEmbeddings } = require('@langchain/openai');
const { PineconeStore } = require('@langchain/pinecone');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');

// --- NEW: File System for Permanent Storage ---
const fs = require('fs');
const path = require('path');
const DB_PATH = path.join(__dirname, 'document-list.json');


/* =============================================
   |       ENVIRONMENT VARIABLE LOADING        |
   ============================================= */
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const app = express();
const PORT = process.env.PORT || 5000;

/* =============================================
   |       CORS (CROSS-ORIGIN) CONFIG          |
   ============================================= */
const allowedOrigins = [
  'https://test-case-generator-one.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};
app.use((req, res, next) => {
  res.setHeader('Vary', 'Origin');
  next();
});
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

/* =============================================
   |          EXPRESS MIDDLEWARE               |
   ============================================= */
app.use(express.json());


/* =============================================
   | --- NEW: HELPER FUNCTIONS FOR FILE DB ---   |
   ============================================= */
const readDb = () => {
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = fs.readFileSync(DB_PATH);
            return JSON.parse(data);
        }
        return [];
    } catch (error) {
        console.error("Error reading from file database:", error);
        return [];
    }
};

const writeDb = (data) => {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Error writing to file database:", error);
    }
};


/* =============================================
   |          REDIS & BULLMQ SETUP             |
   ============================================= */
const redisConnectionStr = process.env.REDIS_URL || 'redis://red-d29m3t2li9vc73ftd970:6379';
console.log('Attempting to connect to Redis host:', new URL(redisConnectionStr).host);
const redisConnection = new IORedis(redisConnectionStr, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  tls: redisConnectionStr.startsWith('rediss://') ? {} : undefined,
});
const signupQueue = new Queue('signup-jobs', { connection: redisConnection });

/* =============================================
   |      KNOWLEDGE BASE (RAG) SETUP           |
   ============================================= */
const pinecone = new Pinecone();
const pineconeIndex = pinecone.index(process.env.PINECONE_INDEX_NAME);
const embeddings = new OpenAIEmbeddings({ modelName: 'text-embedding-3-small' });
const vectorStore = new PineconeStore(embeddings, { pineconeIndex });

// This temporary in-memory store is no longer used and has been replaced by the file DB.
// let documentMetadataStore = [];

const storage = multer.memoryStorage();
const upload = multer({ storage });


/* =============================================
   |                API ROUTES                 |
   ============================================= */

// --- Root Route ---
app.get('/', (req, res) => res.send('Backend is running!'));

// --- KNOWLEDGE BASE ROUTES (Using Simple File DB) ---
app.post('/api/knowledge/upload', upload.single('document'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No document file provided.' });
  }

  try {
    console.log(`Processing document: ${req.file.originalname} (Type: ${req.file.mimetype})`);
    const docId = uuidv4();
    const docName = req.file.originalname;
    
    // --- ADVANCED FILE PARSING LOGIC (Unchanged) ---
    let text = '';
    const fileBuffer = req.file.buffer;

    if (req.file.mimetype === 'application/pdf') {
        const pdfData = await pdf(fileBuffer);
        text = pdfData.text;
    } else if (req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const docxData = await mammoth.extractRawText({ buffer: fileBuffer });
        text = docxData.value;
    } else if (req.file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        let fullText = '';
        workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            sheetData.forEach(row => {
                fullText += row.join(' ') + '\n';
            });
        });
        text = fullText;
    } else {
        text = fileBuffer.toString('utf-8');
    }

    if (!text || text.trim().length === 0) {
        return res.status(400).json({ error: 'Could not extract any text from the document.' });
    }

    const doc = new Document({ pageContent: text });

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const docs = await splitter.splitDocuments([doc]);

    docs.forEach(chunk => {
      chunk.metadata.docId = docId;
      chunk.metadata.docName = docName;
    });

    await PineconeStore.fromDocuments(docs, embeddings, {
      pineconeIndex,
    });
    
    // --- MODIFIED: Save metadata to the JSON file ---
    const documents = readDb();
    documents.push({ id: docId, name: docName });
    writeDb(documents);

    res.status(201).json({ message: 'Document uploaded and processed.', document: { id: docId, name: docName } });
  } catch (error) {
    console.error('KB Upload Error:', error);
    res.status(500).json({ error: 'Failed to process document.' });
  }
});

app.get('/api/knowledge', (req, res) => {
  // --- MODIFIED: Fetch list from the JSON file ---
  const documents = readDb();
  res.json({ documents });
});

app.delete('/api/knowledge/:docId', async (req, res) => {
  const { docId } = req.params;
  try {
    await pineconeIndex.deleteMany({ docId });
    
    // --- MODIFIED: Delete from the JSON file ---
    let documents = readDb();
    documents = documents.filter(doc => doc.id !== docId);
    writeDb(documents);
    
    res.status(200).json({ message: 'Document deleted successfully.' });
  } catch (error) {
    console.error('KB Delete Error:', error);
    res.status(500).json({ error: 'Failed to delete document.' });
  }
});


// --- Job Queue Routes ---
app.post('/signup-agent', async (req, res) => {
  try {
    let { count, environment, region } = req.body || {};
    count = Math.floor(Number(count));
    if (!Number.isFinite(count) || count < 1) return res.status(400).json({ error: 'A valid "count" number is required.' });
    if (count > 3) return res.status(400).json({ error: 'Count must be between 1 and 3.' });

    const envNorm = String(environment ?? 'dev').toLowerCase();
    const regionNorm = String(region ?? 'US').toUpperCase();
    const safeEnv = envNorm === 'staging' ? 'staging' : 'dev';
    const safeRegion = regionNorm === 'CA' ? 'CA' : 'US';

    console.log(`ENQUEUE: count=${count}, environment=${safeEnv}, region=${safeRegion}`);
    const job = await signupQueue.add('create-accounts-job', {
      countToCreate: count,
      environment: safeEnv,
      region: safeRegion,
    });
    res.status(202).json({ jobId: job.id });
  } catch (e) {
    console.error('enqueue /signup-agent error:', e);
    res.status(500).json({ error: 'Failed to enqueue job' });
  }
});

app.get('/job-status/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const job = await signupQueue.getJob(jobId);
  if (!job) return res.status(404).json({ status: 'not found' });
  const status = await job.getState();
  const returnValue = job.returnvalue;
  res.json({ status, result: returnValue });
});

// --- AI Model Initializations ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// --- AI Generation Routes ---
app.post('/ai-generate-playwright', async (req, res) => {
  try {
    const { scenario } = req.body;
    if (!scenario) return res.status(400).json({ error: 'Scenario is required' });
    const prompt = `You are a senior Playwright automation engineer...`; 
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }]
    });
    const code = completion.choices[0]?.message?.content || 'No code generated.';
    res.json({ code });
  } catch (error) {
    console.error('Playwright AI Error:', error.message);
    res.status(500).json({ error: 'Failed to generate Playwright code' });
  }
});

app.post('/generate-test-cases', async (req, res) => {
  try {
    const { input, useKnowledgeBase } = req.body;
    if (!input) return res.status(400).json({ error: 'Input is required' });
    let finalInput = input;
    if (useKnowledgeBase) {
      console.log('OpenAI: Augmenting prompt with knowledge base...');
      const relevantDocs = await vectorStore.similaritySearch(input, 3);
      const context = relevantDocs.map(doc => doc.pageContent).join('\n---\n');
      finalInput = `Based on the following context...\n\n[CONTEXT]\n${context}\n\n[USER REQUEST]\n${input}`;
    }
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: finalInput }]
    });
    const result = completion.choices[0]?.message?.content || 'No response';
    res.json({ output: result });
  } catch (error) {
    console.error('OpenAI Error:', error.message);
    res.status(500).json({ error: 'Failed to generate test cases from OpenAI' });
  }
});

app.post('/generate-gemini-test-cases', async (req, res) => {
  try {
    const { input, useKnowledgeBase } = req.body;
    if (!input) return res.status(400).json({ error: 'Input is required' });
    let finalInput = input;
    if (useKnowledgeBase) {
      console.log('Gemini: Augmenting prompt with knowledge base...');
      const relevantDocs = await vectorStore.similaritySearch(input, 3);
      const context = relevantDocs.map(doc => doc.pageContent).join('\n---\n');
      finalInput = `Based on the following context...\n\n[CONTEXT]\n${context}\n\n[USER REQUEST]\n${input}`;
    }
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // Updated Gemini model
    const result = await model.generateContent(finalInput);
    const text = result.response.text();
    res.json({ output: text });
  } catch (error) {
    console.error('Gemini Error:', error.message);
    res.status(500).json({ error: 'Failed to generate test cases from Gemini' });
  }
});

app.post('/generate-claude-test-cases', async (req, res) => {
  try {
    const { input, useKnowledgeBase } = req.body;
    if (!input) return res.status(400).json({ error: 'Input is required' });
    let finalInput = input;
    if (useKnowledgeBase) {
      console.log('Claude: Augmenting prompt with knowledge base...');
      const relevantDocs = await vectorStore.similaritySearch(input, 3);
      const context = relevantDocs.map(doc => doc.pageContent).join('\n---\n');
      finalInput = `Based on the following context...\n\n[CONTEXT]\n${context}\n\n[USER REQUEST]\n${input}`;
    }
    const msg = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620", // Updated Claude model
      max_tokens: 4096,
      messages: [{ role: "user", content: finalInput }],
    });
    const result = msg.content[0]?.text || 'No response';
    res.json({ output: result });
  } catch (error) {
    console.error('Claude Error:', error);
    res.status(500).json({ error: 'Failed to generate test cases from Claude' });
  }
});

/* =============================================
   |              SERVER START                 |
   ============================================= */
app.listen(PORT, () => {
  console.log(`Server is running and listening on port ${PORT}`);
});