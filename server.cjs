const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Anthropic = require('@anthropic-ai/sdk');
// FIX 1: Consolidated Playwright import. We only need this one at the top.
const playwright = require('playwright'); 

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const corsOptions = {
  origin: 'https://test-case-generator-one.vercel.app' 
};
app.use(cors(corsOptions));

// FIX 2: Removed the commented-out, redundant app.use(cors()) for cleanliness.
app.use(express.json());

// --- Model initializations ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });


// FIX 3: Extracted the repetitive cookie logic into a reusable helper function.
async function handleCookiePopup(page, step) {
    try {
        console.log(`[Step ${step}] Checking for cookie popup...`);
        const closeButton = page.locator('button[aria-label="Close"]');
        await closeButton.waitFor({ state: 'visible', timeout: 3000 });
        console.log(`[Step ${step}] Cookie popup found. Closing it.`);
        await closeButton.click();
        // Forcefully remove the overlay in case of issues, as you were doing before.
        await page.evaluate(() => document.getElementById('onetrust-consent-sdk')?.remove());
    } catch {
        console.log(`[Step ${step}] No cookie popup visible or it was already closed.`);
    }
}


// Endpoint to create test accounts
app.post('/signup-agent', async (req, res) => {
  const { count } = req.body;
  
  // FIX 4: Improved reporting for successes and failures.
  const successes = [];
  const failures = [];

  // FIX 5 (CRITICAL): Launch the browser ONCE, outside the loop.
  const browser = await playwright.chromium.launch({ headless: true });
  
  try {
    for (let i = 0; i < (count || 1); i++) {
      // FIX 6: Create a new page for each iteration inside the loop.
      const page = await browser.newPage();
      let step = 1;
      
      // FIX 7: Use a try/catch block for each individual account.
      // This prevents one failure from stopping the whole process.
      try {
        console.log(`\n--- Creating Account #${i + 1} ---`);
        
        // 1. Open Dev URL
        console.log(`[Step ${step++}] Opening URL`);
        await page.goto('https://main-bk-us-web.com.rbi.tools/', { waitUntil: 'load', timeout: 60000 });

        // 2. Enter Password
        console.log(`[Step ${step++}] Entering password and submitting`);
        await page.fill('input[type="password"]', 'rbi-tech');
        await page.getByRole('button', { name: 'Submit' }).click();

        // 3. Handle Cookies & Env Screen
        await handleCookiePopup(page, step++);
        
        // Use locator to find and click "Continue", it will auto-wait.
        const continueButton = page.getByRole('button', { name: 'Continue' });
        if (await continueButton.isVisible()) {
            console.log(`[Step ${step++}] Clicking Continue on env screen`);
            await continueButton.click();
        } else {
            console.log(`[Step ${step++}] No environment 'Continue' screen found.`);
        }

        // 4. Click Profile Icon
        console.log(`[Step ${step++}] Clicking Profile Icon`);
        // Let Playwright's auto-wait handle this instead of fixed timeouts.
        await page.getByRole('button', { name: 'Sign Up or Sign In' }).click();

        // 5. Handle potential cookie popup again
        await handleCookiePopup(page, step++);

        // 6. Click "Continue with Email"
        console.log(`[Step ${step++}] Clicking Continue with Email`);
        await page.getByRole('button', { name: 'Continue with Email' }).click();
  
        // 7. Enter unique email
        const rand = Math.floor(Math.random() * 1e8);
        const email = `aiqatest${rand}@yopmail.com`;
        console.log(`[Step ${step++}] Entering email: ${email}`);
        await page.fill('input[type="email"]', email);

        // 8. Click "Sign Up / Sign In"
        console.log(`[Step ${step++}] Clicking Sign Up / Sign In`);
        await page.getByTestId('signin-button').click();

        // 9. Fill Name
        console.log(`[Step ${step++}] Filling name`);
        await page.fill('input[data-testid="signup-name-input"]', 'RBI DO NOT MAKE');

        // 10. Check "I agree"
        console.log(`[Step ${step++}] Checking Agree To Terms`);
        await page.getByTestId('signup-agreeToTermsOfService').click();

        // 11. Click "Create an Account"
        console.log(`[Step ${step++}] Clicking Create an Account`);
        await page.getByRole('button', { name: 'Create an Account' }).click();
        
        // Wait for navigation or a success indicator if possible. For now, a short wait is OK.
        await page.waitForTimeout(1500);

        successes.push(email);
        console.log(`[SUCCESS] Account created: ${email}`);
        await page.close(); // Close the page, not the browser

      } catch (err) {
        // This catch block handles an error for a SINGLE account.
        const errorMessage = `Failed to create account #${i + 1}: ${err.message}`;
        console.error(errorMessage);
        failures.push({ accountIndex: i + 1, error: errorMessage });
        
        if (!page.isClosed()) {
            await page.screenshot({ path: `ERROR-Account-${i + 1}.png` });
            await page.close();
        }
      }
    } // End of for loop

    res.json({ success: true, successes, failures });

  } catch (err) {
    // This outer catch block handles a major failure, like the browser failing to launch.
    console.error('A critical error occurred in the signup agent:', err);
    res.status(500).json({ 
        success: false, 
        error: "The automation agent failed critically. Please check the server logs." 
    });
  } finally {
      // FIX 8: Always ensure the browser is closed when the process is done.
      if (browser) {
          await browser.close();
      }
  }
});

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
