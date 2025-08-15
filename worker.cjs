// =================================================================
// === This is the complete and correct code for worker.js       ===
// =================================================================

const { Worker /*, QueueScheduler*/ } = require('bullmq');
const playwright = require('playwright');
const dotenv = require('dotenv');
const IORedis = require('ioredis'); 

// This line is important! It loads your .env file so the worker can find the Redis URL.
// --- THIS IS THE CRUCIAL FIX ---
// Only run dotenv.config() in a non-production environment
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// === Overlay Cleaner ===
async function clearBlockingOverlays(page) {
  try {
    // Remove OneTrust cookie banner
    await page.evaluate(() => {
      const ot = document.getElementById('onetrust-consent-sdk');
      if (ot) ot.remove();

      // Remove large full-screen intercepting divs
      document.querySelectorAll('div[tabindex="0"]').forEach(el => {
        const r = el.getBoundingClientRect();
        const coversScreen =
          r.width >= window.innerWidth * 0.8 &&
          r.height >= window.innerHeight * 0.8 &&
          (getComputedStyle(el).position === 'fixed' || getComputedStyle(el).position === 'absolute');
        if (coversScreen) el.remove();
      });

      // Remove big modal overlays
      document.querySelectorAll('[role="dialog"], .ReactModal__Overlay, .modal, .overlay').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width * r.height > 100000) el.remove();
      });
    });

    // Close any visible close button
    const closeBtn = page.locator('button[aria-label="Close"]');
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click({ timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
  } catch {
    // No-op if nothing to clear
  }
}


// This is the function that contains ALL your Playwright automation logic.
async function createSignupAccounts(count) {
  console.log(`WORKER: Starting signup process for ${count} accounts...`);
  const successes = [];
  const failures = [];

  // Launch the browser ONCE for better performance.
  const browser = await playwright.chromium.launch({ headless: true });
  
  try {
    // This is your for loop, unchanged.
    for (let i = 0; i < (count || 1); i++) {
      // A new page is created for each account.
      const page = await browser.newPage();
      page.setDefaultTimeout(45000);
page.setDefaultNavigationTimeout(45000);

      let step = 1;

      // Your inner try/catch block to handle errors for a single account.
      try {
        console.log(`WORKER: --- Creating Account #${i + 1} ---`);
        
        // =================================================================
        // === Your exact Playwright automation code starts here.        ===
        // === No selectors or logic have been changed.                  ===
        // =================================================================

        // 1. Open Dev URL
        console.log(`WORKER: [Step ${step++}] Opening URL`);
        await page.goto('https://main-bk-us-web.com.rbi.tools/', { waitUntil: 'load' });
        
        // 2. Enter Password (rbi-tech)
        console.log(`WORKER: [Step ${step++}] Entering password`);
        await page.fill('input[type="password"]', 'rbi-tech');
        console.log(`WORKER: [Step ${step++}] Clicking Submit`);
        await page.getByRole('button', { name: 'Submit' }).click();
        await page.waitForTimeout(2000);

        // 3. Handle Cookies Modal
        try {
          console.log(`WORKER: [Step ${step++}] Trying to close cookie popup (close btn)`);
          await page.waitForSelector('button[aria-label="Close"]', { timeout: 4000 });
          await page.click('button[aria-label="Close"]');
          await page.waitForTimeout(800);
        } catch {
          console.log('WORKER: No cookie popup present or already closed.');
        }
        await page.evaluate(() => {
          const ot = document.getElementById('onetrust-consent-sdk');
          if (ot) ot.remove();
        });

        // 4. Click Continue (Env screen)
        try {
          if (await page.isVisible('div[tabindex="0"]', { hasText: "Continue" })) {
            console.log(`WORKER: [Step ${step++}] Clicking Continue on env screen`);
            await page.getByText('Continue').click();
            await page.waitForTimeout(1000);
          }
        } catch (e) {
          console.log('WORKER: No environment continue screen');
        }

        // --- Close Cookie Banner AGAIN if still visible (on Royal Perks) ---
        try {
          console.log(`WORKER: [Step ${step++}] Double-checking/Closing cookie popup again if still visible...`);
          await page.waitForSelector('button[aria-label="Close"]', { timeout: 2000 });
          await page.click('button[aria-label="Close"]');
          await page.waitForTimeout(800);
        } catch {
          console.log('WORKER: Cookie modal did not reappear');
        }
        await page.evaluate(() => {
          const ot = document.getElementById('onetrust-consent-sdk');
          if (ot) ot.remove();
        });
     
        // 5. Click Profile Icon
        console.log(`WORKER: [Step ${step++}] Clicking Profile Icon`);
       await clearBlockingOverlays(page);
       const signBtn1 = page.locator('button[aria-label="Sign Up or Sign In"]');
       await signBtn1.waitFor({ state: 'visible', timeout: 20000 });
      try {
       await signBtn1.click({ timeout: 10000 });
       } catch (e) {
      console.warn('Click intercepted (1st). Forcing click...', e.message);
      await signBtn1.click({ force: true, timeout: 5000 });
      }
      await page.waitForTimeout(1000);

        // --- Close Cookie Banner AGAIN if still visible (just in case) ---
        try {
          console.log(`WORKER: [Step ${step++}] (Final try) Closing cookie popup if STILL visible`);
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
await clearBlockingOverlays(page);

const signBtn2 = page.locator('button[aria-label="Sign Up or Sign In"]');
await signBtn2.waitFor({ state: 'visible', timeout: 20000 });
try {
  await signBtn2.click({ timeout: 10000 });
} catch (e) {
  console.warn('Click intercepted (2nd). Forcing click...', e.message);
  await signBtn2.click({ force: true, timeout: 5000 });
}
await page.waitForTimeout(1000);

console.log(`WORKER: [Step ${step++}] Clicking Continue with Email`);
await page.getByRole('button', { name: 'Continue with Email' }).click();
await page.waitForTimeout(1000);

  
        // 7. Enter unique email
        const rand = Math.floor(Math.random() * 1e8);
        const email = `aiqatest${rand}@yopmail.com`;
        console.log(`WORKER: [Step ${step++}] Entering email: ${email}`);
        await page.fill('input[type="email"]', email);

        // 8. Click "Sign Up / Sign In"
        console.log(`WORKER: [Step ${step++}] Clicking Sign Up / Sign In`);
        await page.click('button[data-testid="signin-button"]');
        await page.waitForTimeout(1500);

        // 9. Fill Name
        console.log(`WORKER: [Step ${step++}] Filling name`);
        await page.fill('input[data-testid="signup-name-input"]', 'RBI DO NOT MAKE');

        // 10. Check "I agree"
        console.log(`WORKER: [Step ${step++}] Checking Agree To Terms`);
        await page.click('div[data-testid="signup-agreeToTermsOfService"]');
        await page.waitForTimeout(500);

        // 11. Click "Create an Account"
        console.log(`WORKER: [Step ${step++}] Clicking Create an Account`);
        await page.getByRole('button', { name: 'Create an Account' }).click();
        await page.waitForTimeout(2000);

        successes.push(email);
        console.log(`WORKER: [SUCCESS] Account created: ${email}`);

      } catch (err) {
        const errorMessage = `Failed on account #${i + 1}: ${err.message}`;
        console.error(`WORKER: [FAILURE] ${errorMessage}`);
        failures.push({ accountIndex: i + 1, error: errorMessage });
        
        try {
          if (!page.isClosed()) {
            await page.screenshot({ path: `ERROR-Account-${i + 1}.png` });
          }
        } catch (e) {
          console.error('WORKER: Screenshot error (after failure):', e.message);
        }
      } finally {
        if (!page.isClosed()) await page.close();
      }
    }
  } finally {
    await browser.close();
    console.log("WORKER: Browser closed. Job finished.");
    console.log("WORKER: Successful Accounts:", successes);
    console.log("WORKER: Failed Accounts:", failures);
  }

  // ADDED: This returns the final results so they can be saved with the job.
  return { successes, failures };
}


// =================================================================
// === This is the code that defines the worker itself.         ===
// =================================================================


console.log('WORKER: Worker process starting...');

const REDIS_URL = "redis://red-d29m3t2li9vc73ftd970:6379";

const workerConnection = { connection: process.env.REDIS_URL };

// ---- ADDED: ensure BullMQ gets a real Redis connection (no localhost fallback)
const _redisConnStr = process.env.REDIS_URL || REDIS_URL;
const _redis = new IORedis(_redisConnStr, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  tls: _redisConnStr.startsWith('rediss://') ? {} : undefined,
});

// If workerConnection is missing or just a string, replace with ioredis instance
if (!workerConnection.connection || typeof workerConnection.connection === 'string') {
  workerConnection.connection = _redis;
}

// (Optional, only needed for delayed/retry jobs)
// const { QueueScheduler } = require('bullmq');
// new QueueScheduler('signup-jobs', { connection: workerConnection.connection });


const worker = new Worker('signup-jobs', async (job) => {
  const { countToCreate } = job.data;
  console.log(`WORKER: Received job ${job.id}. Will create ${countToCreate} accounts.`);

  // ADDED: The 'return' here saves the result from createSignupAccounts to the job.
  return await createSignupAccounts(countToCreate);

}, { ...workerConnection, concurrency: 1 });

worker.on('completed', (job, result) => {
  console.log(`WORKER: Job ${job.id} has completed. Result:`, result);
});

worker.on('failed', (job, err) => {
  console.error(`WORKER: Job ${job.id} has failed with error: ${err.message}`);
});

console.log('WORKER: Ready and listening for jobs.');

// (Optional) graceful shutdown for Redis (nice to have)
process.on('SIGINT', async () => { try { await _redis.quit(); } finally { process.exit(0); } });
process.on('SIGTERM', async () => { try { await _redis.quit(); } finally { process.exit(0); } });
