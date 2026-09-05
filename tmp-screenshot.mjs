import puppeteer from "puppeteer";

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
await page.goto("http://localhost:5173/dispatch/planners/truck", { waitUntil: "networkidle2", timeout: 30000 });
await new Promise((r) => setTimeout(r, 2000));
await page.screenshot({ path: "/Users/jorgemunoz/IH35-TMS-cascade/tmp-k4-screenshot.png", fullPage: true });
console.log("saved /Users/jorgemunoz/IH35-TMS-cascade/tmp-k4-screenshot.png");
await browser.close();
