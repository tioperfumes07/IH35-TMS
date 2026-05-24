#!/usr/bin/env node
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { createVerifyPrecommitContext } from "./verify-steps/_context.mjs";
import { runStep } from "./verify-steps/_runner.mjs";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const stepsDir = path.join(__dirname, "verify-steps");
const stepFiles = readdirSync(stepsDir).filter((f) => f.endsWith(".mjs") && !f.startsWith("_")).sort();
const steps = await Promise.all(stepFiles.map(async (file) => (await import(pathToFileURL(path.join(stepsDir, file)).href)).default));
const ctx = createVerifyPrecommitContext(ROOT);

try {
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    await runStep({ index: i + 1, total: steps.length, name: step.name, run: () => step.run(ctx) });
  }
  console.log("verify:pre-commit PASS");
} finally {
  ctx.cleanup();
}
