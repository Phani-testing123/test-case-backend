const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Anthropic = require('@anthropic-ai/sdk');
const { chromium } = require('playwright'); // <-- NEW!

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// --- Model initializations ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

//const playwright = require('playwright'); // Make sure playwright is required

app.post('/signup-agent', async (req, res) => {
  const { count } = req.body;
  let emails = [];

  try {
    for (let i = 0; i < (count || 1); i++) {
      const browser = await playwright.chromium.launch({ headless: true });
      const page = await browser.newPage();
      let step = 1;
      try {
        // 1. Open Dev URL
        console.log(`[Step ${step++}] Opening URL`);
        await page.goto('https://main-bk-us-web.com.rbi.tools/', { waitUntil: 'load' });
        //await page.screenshot({ path: `step${step}-opened-url.png` });

        // 2. Enter Password (rbi-tech)
        console.log(`[Step ${step++}] Entering password`);
        await page.fill('input[type="password"]', 'rbi-tech');
        console.log(`[Step ${step++}] Clicking Submit`);
        await page.getByRole('button', { name: 'Submit' }).click();
        await page.waitForTimeout(2000);

        // 3. Handle Cookies Modal
        let cookieBannerStillVisible = false;
        try {
          console.log(`[Step ${step++}] Trying to close cookie popup (close btn)`);
          await page.waitForSelector('button[aria-label="Close"]', { timeout: 4000 });
          await page.click('button[aria-label="Close"]');
          await page.waitForTimeout(800);
        } catch {
          console.log('No cookie popup present or already closed.');
        }
        // Remove overlay if still present (and take screenshot)
        await page.evaluate(() => {
          const ot = document.getElementById('onetrust-consent-sdk');
          if (ot) ot.remove();
        });

        // 4. Click Continue (Env screen)
        try {
          if (await page.isVisible('div[tabindex="0"]', { hasText: "Continue" })) {
            console.log(`[Step ${step++}] Clicking Continue on env screen`);
            await page.getByText('Continue').click();
            await page.waitForTimeout(1000);
          }
        } catch (e) {
          console.log('No environment continue screen');
        }

        // --- Close Cookie Banner AGAIN if still visible (on Royal Perks) ---
        try {
          console.log(`[Step ${step++}] Double-checking/Closing cookie popup again if still visible...`);
          await page.waitForSelector('button[aria-label="Close"]', { timeout: 2000 });
          await page.click('button[aria-label="Close"]');
          await page.waitForTimeout(800);
        } catch {
          console.log('Cookie modal did not reappear');
        }
        // Remove overlay (again)
        await page.evaluate(() => {
          const ot = document.getElementById('onetrust-consent-sdk');
          if (ot) ot.remove();
        });
     

        // 5. Click Profile Icon
        console.log(`[Step ${step++}] Clicking Profile Icon`);
        await page.waitForSelector('button[aria-label="Sign Up or Sign In"]', { timeout: 20000 });
        await page.click('button[aria-label="Sign Up or Sign In"]');
        await page.waitForTimeout(1000);

        // --- Close Cookie Banner AGAIN if still visible (just in case) ---
        try {
          console.log(`[Step ${step++}] (Final try) Closing cookie popup if STILL visible`);
          await page.waitForSelector('button[aria-label="Close"]', { timeout: 2000 });
          await page.click('button[aria-label="Close"]');
          await page.waitForTimeout(800);
        } catch {
          // It's fine
        }
        await page.evaluate(() => {
          const ot = document.getElementById('onetrust-consent-sdk');
          if (ot) ot.remove();
        });
    

        // 6. Click "Continue with Email"
        await page.waitForSelector('button[aria-label="Sign Up or Sign In"]', { timeout: 20000 });
        await page.click('button[aria-label="Sign Up or Sign In"]');
        await page.waitForTimeout(1000);
        console.log(`[Step ${step++}] Clicking Continue with Email`);
        await page.getByRole('button', { name: 'Continue with Email' }).click();
        await page.waitForTimeout(1000);
  

        // 7. Enter unique email
  
      const rand = Math.floor(Math.random() * 1e8);
      const email = `aiqatest${rand}@yopmail.com`;
      console.log(`[Step ${step++}] Entering email: ${email}`);
      await page.fill('input[type="email"]', email);



        // 8. Click "Sign Up / Sign In"
        console.log(`[Step ${step++}] Clicking Sign Up / Sign In`);
        await page.click('button[data-testid="signin-button"]');
        await page.waitForTimeout(1500);

        // 9. Fill Name
        console.log(`[Step ${step++}] Filling name`);
       await page.fill('input[data-testid="signup-name-input"]', 'RBI DO NOT MAKE');

        // 10. Check "I agree"
        console.log(`[Step ${step++}] Checking Agree To Terms`);
        await page.click('div[data-testid="signup-agreeToTermsOfService"]');
        await page.waitForTimeout(500);

        // 11. Click "Create an Account"
        console.log(`[Step ${step++}] Clicking Create an Account`);
        await page.getByRole('button', { name: 'Create an Account' }).click();
        await page.waitForTimeout(2000);

        emails.push(email);
        console.log(`[DONE] Account created: ${email}`);
        await browser.close();

      } catch (err) {
        // Error: Try to capture screenshot before closing browser
        try {
          if (!page.isClosed()) {
            await page.screenshot({ path: `step${step}-ERROR.png` });
          }
        } catch (e) {
          console.error('Screenshot error (after failure):', e.message);
        }
        await browser.close();
        throw err;
      }
    }

    res.json({ success: true, emails });
  } catch (err) {
    console.error('Signup agent failed:', err);
    res.status(500).json({ success: false, error: err.message });
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
