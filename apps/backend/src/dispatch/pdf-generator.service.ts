import { readFile } from "node:fs/promises";
import path from "node:path";
import Handlebars from "handlebars";
import puppeteer from "puppeteer";

type DriverInstructionTemplate = {
  loadNumber: string;
  companyId: string;
  generatedAt: string;
  driverName: string;
  customerName: string;
  commodity: string;
  notes: string;
  stops: Array<{
    stopType: string;
    sequence: number;
    address: string;
    cityState: string;
    eta: string;
  }>;
};

let compiledTemplate: HandlebarsTemplateDelegate<DriverInstructionTemplate> | null = null;

async function getTemplate() {
  if (compiledTemplate) return compiledTemplate;
  const templatePath = path.resolve(process.cwd(), "apps/backend/src/dispatch/pdf-template/driver-instructions.hbs");
  const source = await readFile(templatePath, "utf8");
  compiledTemplate = Handlebars.compile<DriverInstructionTemplate>(source);
  return compiledTemplate;
}

export async function generateDriverInstructionsPdf(payload: DriverInstructionTemplate) {
  const template = await getTemplate();
  const html = template(payload);
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "Letter", printBackground: true });
    return {
      pdfBuffer: Buffer.from(pdf),
      html,
      filename: `driver-instructions-${payload.loadNumber}.pdf`,
      mimeType: "application/pdf",
    };
  } finally {
    await browser.close();
  }
}
