#!/usr/bin/env node
/**
 * P23 live V2 smoke via seat CDP (9228 Codex). USMCA entity · picker + Add new → creator → R=W → reload.
 * Usage: node scripts/ops/p23-live-v2-smoke-cdp.mjs [--port 9228]
 */
import puppeteer from "puppeteer-core";

const PORT = process.argv.includes("--port")
  ? process.argv[process.argv.indexOf("--port") + 1]
  : "9228";
const CDP = `http://127.0.0.1:${PORT}`;
const APP = "https://app.ih35dispatch.com";
const BOOK_LOAD = `${APP}/dispatch/book-load`;
const USMCA_LABEL = "USMCA";
const stamp = `P23-SMOKE-${Date.now()}`;

function log(msg) {
  console.log(`[p23-live-v2] ${msg}`);
}

async function pickAppPage(browser) {
  const pages = await browser.pages();
  let page = pages.find((p) => p.url().includes("app.ih35dispatch.com"));
  if (!page) {
    page = await browser.newPage();
    await page.goto(APP, { waitUntil: "networkidle2", timeout: 120_000 });
  }
  return page;
}

async function ensureUsMCA(page) {
  const body = await page.evaluate(() => document.body?.innerText ?? "");
  if (body.includes(USMCA_LABEL) && !body.match(/Operating company:\s*TRANSP/i)) {
    log("entity appears USMCA (heuristic OK)");
    return;
  }
  const switched = await page.evaluate((label) => {
    const buttons = [...document.querySelectorAll("button,[role=button]")];
    const sw = buttons.find((b) => /company|entity|carrier/i.test(b.textContent ?? ""));
    sw?.click();
    return Boolean(sw);
  }, USMCA_LABEL);
  if (switched) {
    await new Promise((r) => setTimeout(r, 800));
    await page.evaluate((label) => {
      const opts = [...document.querySelectorAll("button,[role=menuitem],li,a")];
      const us = opts.find((o) => (o.textContent ?? "").trim() === label);
      us?.click();
    }, USMCA_LABEL);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function main() {
  log(`connect ${CDP}`);
  const browser = await puppeteer.connect({ browserURL: CDP, defaultViewport: null });
  const page = await pickAppPage(browser);
  await page.bringToFront();
  await ensureUsMCA(page);
  log(`navigate ${BOOK_LOAD}`);
  await page.goto(BOOK_LOAD, { waitUntil: "networkidle2", timeout: 120_000 });

  const title = await page.title();
  if (/sign in|login/i.test(title + (await page.content()))) {
    throw new Error("UNVERIFIED — not logged in on seat Chrome; log in as Owner on 9228 first");
  }

  log("open Book Load drawer");
  const bookLoadBtn = await page.waitForFunction(
    () => {
      const btns = [...document.querySelectorAll("button")];
      return btns.find((b) => (b.textContent ?? "").trim() === "+ Book Load");
    },
    { timeout: 20_000 }
  );
  await (await bookLoadBtn.asElement()).click();
  await new Promise((r) => setTimeout(r, 2000));

  // Open customer ReferenceSelect (first Customer * field)
  const combo = await page.waitForSelector(
    'input[placeholder*="Search customers" i], input[placeholder*="Select customer" i]',
    { timeout: 30_000 }
  );
  await combo.click();
  await new Promise((r) => setTimeout(r, 600));

  const addNew = await page.waitForFunction(
    () => {
      const nodes = [...document.querySelectorAll('[role="option"], [role="listbox"] *')];
      return nodes.find((n) => /^\+\s*Add new customer/i.test((n.textContent ?? "").trim()));
    },
    { timeout: 20_000 }
  );
  const addHandle = await addNew.asElement();
  const addText = await page.evaluate((el) => el?.textContent?.trim(), addHandle);
  log(`click inline create row: ${addText}`);
  await addHandle.click();
  await new Promise((r) => setTimeout(r, 1500));

  const formSel = '[data-testid="inline-customer-profile-create-form"]';
  await page.waitForSelector(formSel, { timeout: 20_000 });
  const email = `p23smoke+${Date.now()}@example.com`;
  const nameInput = await page.waitForSelector(`${formSel} input[type="text"]`);
  await nameInput.click({ clickCount: 3 });
  await nameInput.type(stamp, { delay: 10 });
  await page.select(`${formSel} select[name="customer_type"]`, "broker");
  const emailInput = await page.waitForSelector(`${formSel} input[type="email"]`);
  await emailInput.click({ clickCount: 3 });
  await emailInput.type(email, { delay: 10 });
  await page.click(`${formSel} button[type="submit"]`);
  await new Promise((r) => setTimeout(r, 6000));

  const selected = await page.evaluate((name) => {
    const combo = document.querySelector(
      'input[placeholder*="Select customer" i], input[placeholder*="Search customers" i]'
    );
    const comboVal = combo?.value ?? "";
    const hidden = document.querySelector('input[name="customer_id"]')?.value ?? "";
    return comboVal.includes(name) && Boolean(hidden);
  }, stamp);
  if (!selected) {
    throw new Error(`R=W FAIL — creator saved but "${stamp}" not visible on form`);
  }
  log(`R=W OK — "${stamp}" selected on form`);

  await page.reload({ waitUntil: "networkidle2", timeout: 120_000 });
  await new Promise((r) => setTimeout(r, 2000));

  log("reopen Book Load drawer after reload");
  const bookLoadBtn2 = await page.waitForFunction(
    () => {
      const btns = [...document.querySelectorAll("button")];
      return btns.find((b) => (b.textContent ?? "").trim() === "+ Book Load");
    },
    { timeout: 20_000 }
  );
  await (await bookLoadBtn2.asElement()).click();
  await new Promise((r) => setTimeout(r, 2000));

  const combo2 = await page.waitForSelector(
    'input[placeholder*="Search customers" i], input[placeholder*="Select customer" i]',
    { timeout: 30_000 }
  );
  await combo2.click();
  await new Promise((r) => setTimeout(r, 800));
  await combo2.type(stamp.slice(0, 12), { delay: 20 });
  await new Promise((r) => setTimeout(r, 1200));

  const survives = await page.waitForFunction(
    (name) => {
      const nodes = [...document.querySelectorAll('[role="option"], [role="listbox"] *')];
      return nodes.some((n) => (n.textContent ?? "").includes(name));
    },
    { timeout: 20_000 },
    stamp
  );
  if (!survives) {
    throw new Error(`reload FAIL — "${stamp}" not in picker after reload`);
  }
  log(`reload OK — "${stamp}" still in picker`);
  log(`PASS entity=${USMCA_LABEL} port=${PORT} name=${stamp}`);
  await browser.disconnect();
}

main().catch((err) => {
  console.error(`[p23-live-v2] FAIL: ${err.message}`);
  process.exit(1);
});
