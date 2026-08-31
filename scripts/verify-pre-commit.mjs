#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { resolveBlockReadyManifest } from "./block-ready-agent-manifest.mjs";
import { createVerifyPrecommitContext } from "./verify-steps/_context.mjs";
import { runStep } from "./verify-steps/_runner.mjs";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const resolvedManifest = resolveBlockReadyManifest({
  worktreePath: ROOT,
  allowAggregate: true,
});
if (resolvedManifest.agent && !process.env.AGENT) {
  process.env.AGENT = resolvedManifest.agent;
}
if (resolvedManifest.manifest) {
  process.env.BLOCK_READY_MANIFEST = resolvedManifest.manifest;
  console.log(
    `verify:pre-commit using block-ready manifest ${resolvedManifest.manifest} (${resolvedManifest.resolution})`
  );
} else {
  delete process.env.BLOCK_READY_MANIFEST;
  console.warn(
    `verify:pre-commit aggregate mode — ${resolvedManifest.reason}; all verify-steps still run`
  );
}
const stepsDir = path.join(__dirname, "verify-steps");
const stepFiles = readdirSync(stepsDir).filter((f) => f.endsWith(".mjs") && !f.startsWith("_")).sort();
const stepDefinitions = await Promise.all(
  stepFiles.map(async (file) => {
    const filePath = path.join(stepsDir, file);
    const source = readFileSync(filePath, "utf8");

    if (/^\s*export\s+default\b/m.test(source)) {
      const step = (await import(pathToFileURL(filePath).href)).default;
      if (!step) {
        throw new Error(`verify:pre-commit structured step has no default export: ${file}`);
      }
      return step;
    }

    // Legacy verify-step files execute at module scope. Importing them into this process is unsafe:
    // process.exit(0) in any one file terminates the aggregate runner before the structured steps run.
    // Keep their historical CLI contract, but isolate termination and failures in a child process.
    return {
      name: path.basename(file, ".mjs"),
      run: (ctx) => ctx.run("node", [path.relative(ROOT, filePath)]),
    };
  })
);
const steps = stepDefinitions.filter(Boolean);
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
