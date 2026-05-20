import path from "node:path";
import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import puppeteer from "puppeteer";

type TemplateDelegate = HandlebarsTemplateDelegate<Record<string, unknown>>;

const templateCache = new Map<string, TemplateDelegate>();

async function getCompiledTemplate(templateName: string): Promise<TemplateDelegate> {
  const cached = templateCache.get(templateName);
  if (cached) return cached;
  const templatePath = path.resolve(
    process.cwd(),
    "apps/backend/src/accounting/export/templates",
    `${templateName}.hbs`,
  );
  const source = await readFile(templatePath, "utf8");
  const compiled = Handlebars.compile(source);
  templateCache.set(templateName, compiled);
  return compiled;
}

export async function renderStatementPdf(input: {
  templateName: string;
  viewModel: Record<string, unknown>;
}): Promise<Buffer> {
  const template = await getCompiledTemplate(input.templateName);
  const html = template(input.viewModel);
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "Letter", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
