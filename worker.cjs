// =================================================================
// === This is the complete and correct code for worker.js       ===
// =================================================================

const { Worker /*, QueueScheduler*/ } = require('bullmq');
const playwright = require('playwright');
const dotenv = require('dotenv');
const IORedis = require('ioredis'); 

// Load .env only outside production
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// === Overlay Cleaner ===
async function clearBlockingOverlays(page) {
  try {
    // Remove OneTrust cookie banner + large overlays
    await page.evaluate(() => {
      const ot = document.getElementById('onetrust-consent-sdk');
      if (ot) ot.remove();

      document.querySelectorAll('div[tabindex="0"]').forEach(el => {
        const r = el.getBoundingClientRect();
        const coversScreen =
          r.width >= window.innerWidth * 0.8 &&
          r.height >= window.innerHeight * 0.8 &&
          (getComputedStyle(el).position === 'fixed' || getComputedStyle(el).position === 'absolute');
        if (coversScreen) el.remove();
      });

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
    // ignore
  }
}

/* ---------------- Env screen helpers ---------------- */
function norm(s){ return String(s||'').toLowerCase().trim(); }
function wantedEnv(env){ return norm(env)==='staging' ? 'staging' : 'dev'; }
function wantedReg(reg){ return norm(reg)==='ca' ? 'ca' : 'us'; }

// Your concrete paths (priority clicks)
const SELECTOR_STAGING = '#root > div > div > div:nth-child(4) > div.css-175oi2r.r-1awozwy.r-1q9bdsx.r-d045u9.r-1472mwg.r-1777fci.r-lrsllp';
const SELECTOR_CA      = '#root > div > div > div:nth-child(8) > div.css-175oi2r.r-1awozwy.r-1q9bdsx.r-d045u9.r-1472mwg.r-1777fci.r-lrsllp';

// Fallback select by visible text
async function selectByText(page, text) {
  const re = new RegExp(`\\b${text}\\b`, 'i');

  // role=radio by name
  const byRole = page.getByRole('radio', { name: re });
  if (await byRole.count()) {
    try { await byRole.first().check({ timeout: 800 }); }
    catch { await byRole.first().click({ force: true, timeout: 800 }).catch(()=>{}); }
    await page.waitForTimeout(150);
    return true;
  }

  // label click
  const byLabel = page.getByLabel(re);
  if (await byLabel.count()) {
    try { await byLabel.first().check({ timeout: 800 }); }
    catch { await byLabel.first().click({ force: true, timeout: 800 }).catch(()=>{}); }
    await page.waitForTimeout(150);
    return true;
  }

  // generic label/container
  const labelEl = page.locator('label, div, li, span').filter({ hasText: re });
  if (await labelEl.count()) {
    await labelEl.first().click({ timeout: 800 }).catch(async () => {
      await labelEl.first().click({ force: true, timeout: 800 }).catch(()=>{});
    });
    await page.waitForTimeout(150);
    return true;
  }
  return false;
}

// Verify selected via "(current)" or aria-checked/checked near text
async function verifySelected(page, text) {
  const reCurrent = new RegExp(`${text}\\s*\\(current\\)`, 'i');
  if (await page.getByText(reCurrent).count().catch(()=>0)) return true;

  const ok = await page.evaluate((t) => {
    const txt = String(t).toLowerCase();
    const nodes = Array.from(document.querySelectorAll('label, li, div, span'));
    for (const n of nodes) {
      if ((n.textContent || '').toLowerCase().includes(txt)) {
        const r = n.querySelector('[role="radio"][aria-checked="true"]') ||
                  n.querySelector('input[type="radio"]:checked');
        if (r) return true;
      }
    }
    return false;
  }, text);
  return !!ok;
}

// === NEW: only selects radios; uses your ORIGINAL Continue logic afterwards
async function selectEnvAndRegionRadios(page, { environment = "dev", region = "US" } = {}) {
  const envTarget = wantedEnv(environment); // 'staging' | 'dev'
  const regTarget = wantedReg(region);      // 'ca' | 'us'

  // Priority selectors for staging / CA
  if (envTarget === 'staging') {
    const st = page.locator(SELECTOR_STAGING);
    if (await st.count()) {
      await st.scrollIntoViewIfNeeded().catch(()=>{});
      await st.click({ timeout: 800 }).catch(async ()=>{ await st.click({ force: true, timeout: 800 }).catch(()=>{}); });
      await page.waitForTimeout(150);
    } else {
      await selectByText(page, 'staging');
    }
  } else {
    await selectByText(page, 'dev');
  }

  if (regTarget === 'ca') {
    const ca = page.locator(SELECTOR_CA);
    if (await ca.count()) {
      await ca.scrollIntoViewIfNeeded().catch(()=>{});
      await ca.click({ timeout: 800 }).catch(async ()=>{ await ca.click({ force: true, timeout: 800 }).catch(()=>{}); });
      await page.waitForTimeout(150);
    } else {
      await selectByText(page, 'CA');
    }
  } else {
    await selectByText(page, 'US');
  }

  // Best-effort verification (non-blocking)
  await verifySelected(page, envTarget === 'staging' ? 'staging' : 'dev').catch(()=>{});
  await verifySelected(page, regTarget === 'ca' ? 'CA' : 'US').catch(()=>{});
}

// === Main Playwright automation ===
async function createSignupAccounts(count, environment = "dev", region = "US") {
  console.log(`WORKER: Starting signup process for ${count} accounts... (env=${environment}, region=${region})`);
  const successes = [];
  const failures = [];

  const browser = await playwright.chromium.launch({ headless: true });
  try {
    for (let i = 0; i < (count || 1); i++) {
      const page = await browser.newPage();
      page.setDefaultTimeout(45000);
      page.setDefaultNavigationTimeout(45000);

      let step = 1;
      try {
        console.log(`WORKER: --- Creating Account #${i + 1} ---`);

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

        // 4. ENV/REGION SCREEN — select radios, then use ORIGINAL Continue logic, accept dialog if it appears
        try {
          const radiosExist = await page.getByRole('radio').count().catch(()=>0);
          const hdrExists = await page.getByText(/select an environment/i).count().catch(()=>0);
          if (radiosExist || hdrExists) {
            console.log(`WORKER: [Step ${step++}] Selecting env/region radios`);
            await selectEnvAndRegionRadios(page, { environment, region });

            console.log(`WORKER: [Step ${step++}] Clicking Continue on env screen (original logic)`);
            const overlayWithContinue = page.locator('div[tabindex="0"]').filter({ hasText: 'Continue' });
            const visible = await overlayWithContinue.first().isVisible().catch(()=>false);

            if (visible) {
              // Arm dialog handler BEFORE clicking Continue
              const dialogAccepted = new Promise((resolve) => {
                const handler = async (dialog) => {
                  try { await dialog.accept(); }
                  finally { page.off('dialog', handler); resolve('accepted'); }
                };
                page.on('dialog', handler);
                setTimeout(() => resolve('no-dialog'), 7000);
              });

              await page.getByText('Continue').click();
              await page.waitForTimeout(1000);

              const res = await dialogAccepted.catch(()=> 'no-dialog');
              if (res === 'accepted') {
                await page.waitForLoadState('domcontentloaded', { timeout: 25000 }).catch(()=>{});
                await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(()=>{});
                await page.waitForTimeout(500);
                console.log('WORKER: Confirm accepted; app reloaded with new env/region.');
              } else {
                console.log('WORKER: No confirm dialog; continued.');
              }
            } else {
              console.log('WORKER: Original Continue overlay not visible; skipping click.');
            }
          }
        } catch (e) {
          console.log('WORKER: Env/Region handling encountered an issue:', e?.message || e);
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
     
        // 5. Click Profile Icon (unchanged but with overlay clear)
        console.log(`WORKER: [Step ${step++}] Clicking Profile Icon`);
        await clearBlockingOverlays(page);
        const signBtn1 = page.locator('button[aria-label="Sign Up or Sign In"]');
        await signBtn1.waitFor({ state: 'visible', timeout: 20000 });
        try { await signBtn1.click({ timeout: 10000 }); }
        catch (e) {
          console.warn('Click intercepted (1st). Forcing click...', e.message);
          await signBtn1.click({ force: true, timeout: 5000 });
        }
        await page.waitForTimeout(1000);

        // --- Cookie again if needed ---
        try {
          console.log(`WORKER: [Step ${step++}] (Final try) Closing cookie popup if STILL visible`);
          await page.waitForSelector('button[aria-label="Close"]', { timeout: 2000 });
          await page.click('button[aria-label="Close"]');
          await page.waitForTimeout(800);
        } catch {}
        await page.evaluate(() => {
          const ot = document.getElementById('onetrust-consent-sdk');
          if (ot) ot.remove();
        });
    
        // 6. Click "Continue with Email"
        await clearBlockingOverlays(page);
        const signBtn2 = page.locator('button[aria-label="Sign Up or Sign In"]');
        await signBtn2.waitFor({ state: 'visible', timeout: 20000 });
        try { await signBtn2.click({ timeout: 10000 }); }
        catch (e) {
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

  // return results for job status API
  return { successes, failures };
}


// =================================================================
// === This is the code that defines the worker itself.         ===
// =================================================================

console.log('WORKER: Worker process starting...');

const REDIS_URL = "redis://red-d29m3t2li9vc73ftd970:6379";

const workerConnection = { connection: process.env.REDIS_URL };

// ensure BullMQ gets a real Redis connection
const _redisConnStr = process.env.REDIS_URL || REDIS_URL;
const _redis = new IORedis(_redisConnStr, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  tls: _redisConnStr.startsWith('rediss://') ? {} : undefined,
});

if (!workerConnection.connection || typeof workerConnection.connection === 'string') {
  workerConnection.connection = _redis;
}

// const { QueueScheduler } = require('bullmq');
// new QueueScheduler('signup-jobs', { connection: workerConnection.connection });

const worker = new Worker('signup-jobs', async (job) => {
  const { countToCreate, environment, region } = {
    countToCreate: Number(job.data.countToCreate ?? job.data.count ?? 1) || 1,
    environment: job.data.environment || job.data.env || job.data.payload?.environment || 'dev',
    region: job.data.region || job.data.reg || job.data.payload?.region || 'US',
  };

  console.log(`WORKER: Received job ${job.id}. Will create ${countToCreate} accounts (env=${environment}, region=${region}).`);

  return await createSignupAccounts(countToCreate, environment, region);

}, { ...workerConnection, concurrency: 1 });

worker.on('completed', (job, result) => {
  console.log(`WORKER: Job ${job.id} has completed. Result:`, result);
});

worker.on('failed', (job, err) => {
  console.error(`WORKER: Job ${job.id} has failed with error: ${err.message}`);
});

console.log('WORKER: Ready and listening for jobs.');

// graceful shutdown for Redis
process.on('SIGINT', async () => { try { await _redis.quit(); } finally { process.exit(0); } });
process.on('SIGTERM', async () => { try { await _redis.quit(); } finally { process.exit(0); } });
