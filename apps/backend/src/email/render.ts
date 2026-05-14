import path from "node:path";
import { fileURLToPath } from "node:url";
import { Eta } from "eta";

const templatesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "templates");

const eta = new Eta({
  views: templatesDir,
  cache: process.env.NODE_ENV === "production",
});

const allowedKeys = new Set([
  "driver-invite",
  "report-cadence",
  "invoice-send",
  "settlement-ready",
  "wo-approved",
  "qbo-sync-alert",
  "notification-dispatch",
]);

export function assertAllowedTemplateKey(templateKey: string): string {
  if (!allowedKeys.has(templateKey)) {
    throw new Error(`unsupported_email_template:${templateKey}`);
  }
  return templateKey;
}

export function deriveTextFallback(html: string, explicit?: string): string | undefined {
  if (explicit && explicit.trim()) return explicit.trim();
  const stripped = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return stripped.length > 0 ? stripped : undefined;
}

export function renderEmailTemplate(templateKey: string, vars: Record<string, unknown>): { html: string; text?: string } {
  const key = assertAllowedTemplateKey(templateKey);
  const html = eta.render(key, vars);
  const explicitText = typeof vars.textBody === "string" ? vars.textBody : undefined;
  const text = deriveTextFallback(html, explicitText);
  return { html, text };
}
