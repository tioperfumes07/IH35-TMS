#!/usr/bin/env node
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { resolveBlockReadyManifest } from "./block-ready-agent-manifest.mjs";
import { createVerifyPrecommitContext } from "./verify-steps/_context.mjs";
import { runStep } from "./verify-steps/_runner.mjs";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const resolvedManifest = resolveBlockReadyManifest({ worktreePath: ROOT });
if (!process.env.AGENT) {
  process.env.AGENT = resolvedManifest.agent;
}
process.env.BLOCK_READY_MANIFEST = resolvedManifest.manifest;
console.log(
  `verify:pre-commit using block-ready manifest ${resolvedManifest.manifest} (agent ${resolvedManifest.agent})`
);
const stepsDir = path.join(__dirname, "verify-steps");
const stepFiles = readdirSync(stepsDir).filter((f) => f.endsWith(".mjs") && !f.startsWith("_")).sort();
const steps = await Promise.all(stepFiles.map(async (file) => (await import(pathToFileURL(path.join(stepsDir, file)).href)).default));
const resolvedSteps = steps.map((step) => {
  if (step.name !== "backend-vitest") {
    return step;
  }

  return {
    ...step,
    run: async (ctx) => {
      if (
        ctx.run("npx", [
          "vitest",
          "run",
          "--config",
          "apps/backend/vitest.config.ts",
          "--reporter=default",
          "--reporter=json",
          "--outputFile",
          ctx.VITEST_REPORT_PATH,
        ]) !== 0
      ) {
        process.exit(1);
      }

      ctx.parseBackendVitestReport();
    },
  };
});
const ctx = createVerifyPrecommitContext(ROOT);

try {
  for (let i = 0; i < resolvedSteps.length; i += 1) {
    const step = resolvedSteps[i];
    await runStep({ index: i + 1, total: resolvedSteps.length, name: step.name, run: () => step.run(ctx) });
  }
  console.log("verify:pre-commit PASS");
} finally {
  ctx.cleanup();
}
