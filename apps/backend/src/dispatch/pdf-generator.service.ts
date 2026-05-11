import { readFile } from "node:fs/promises";
import path from "node:path";
import Handlebars from "handlebars";
import puppeteer from "puppeteer";
import crypto from "node:crypto";

type DriverInstructionTemplate = {
  loadNumber: string;
  companyId: string;
  generatedAt: string;
  recipientRole: "driver" | "customer" | "bol";
  driverName: string;
  customerName: string;
  commodity: string;
  notes: string;
  templateVersion?: string;
  stops: Array<{
    stopType: string;
    sequence: number;
    address: string;
    cityState: string;
    eta: string;
  }>;
};

let compiledTemplate: HandlebarsTemplateDelegate<DriverInstructionTemplate> | null = null;
let activeRenders = 0;
const MAX_CONCURRENT_RENDERS = 4;
const renderWaiters: Array<() => void> = [];

function releaseRenderSlot() {
  activeRenders = Math.max(activeRenders - 1, 0);
  const next = renderWaiters.shift();
  if (next) next();
}

async function acquireRenderSlot() {
  if (activeRenders < MAX_CONCURRENT_RENDERS) {
    activeRenders += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    renderWaiters.push(() => {
      activeRenders += 1;
      resolve();
    });
  });
}

async function getTemplate() {
  if (compiledTemplate) return compiledTemplate;
  Handlebars.registerHelper("eq", (a: unknown, b: unknown) => a === b);
  const templatePath = path.resolve(process.cwd(), "apps/backend/src/dispatch/pdf-template/driver-instructions.hbs");
  const source = await readFile(templatePath, "utf8");
  compiledTemplate = Handlebars.compile<DriverInstructionTemplate>(source);
  return compiledTemplate;
}

export async function generateLoadInstructionsPdf(payload: DriverInstructionTemplate) {
  await acquireRenderSlot();
  const template = await getTemplate();
  try {
    const html = template(payload);
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: "load" });
      const pdf = await page.pdf({ format: "Letter", printBackground: true });
      const pdfBuffer = Buffer.from(pdf);
      return {
        pdfBuffer,
        html,
        filename: `driver-instructions-${payload.loadNumber}-${payload.recipientRole}.pdf`,
        mimeType: "application/pdf",
        sha256: crypto.createHash("sha256").update(pdfBuffer).digest("hex"),
        templateVersion: payload.templateVersion ?? "P6-D3-v1",
      };
    } finally {
      await browser.close();
    }
  } finally {
    releaseRenderSlot();
  }
}

export async function generateDriverInstructionsPdf(payload: Omit<DriverInstructionTemplate, "recipientRole">) {
  return generateLoadInstructionsPdf({ ...payload, recipientRole: "driver" });
}
