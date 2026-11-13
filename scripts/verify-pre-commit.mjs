#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { resolveBlockReadyManifest } from "./block-ready-agent-manifest.mjs";
import { createVerifyPrecommitContext } from "./verify-steps/_context.mjs";
import { runStep } from "./verify-steps/_runner.mjs";

dotenv.config();

// BATTERY-AUTO-REGEN (2026-11-13): when a staged file matches the USMCA battery doc's watch
// patterns, regenerate it and stage it so the PR that adds a POST route never leaves main red
// on verify-derived-artifact-freshness --strict. Runs in pre-commit, not just the 6h cron.
(function maybeRegenBatteryDoc() {
  try {
    const staged = execFileSync("git", ["diff", "--cached", "--name-only"], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    const BATTERY_WATCH = [/^apps\/backend\/src\/.+\.ts$/, /^apps\/frontend\/src\/.+\.tsx$/, /^scripts\/usmca-create-surface-inventory\.mjs$/];
    if (staged.some((f) => BATTERY_WATCH.some((re) => re.test(f)))) {
      console.log("[verify-pre-commit] staged files match battery doc watch — regenerating docs/audit/USMCA-EXHAUSTIVE-BATTERY.md");
      execFileSync("node", ["scripts/gen-usmca-battery-doc.mjs"], { stdio: "inherit" });
      execFileSync("git", ["add", "docs/audit/USMCA-EXHAUSTIVE-BATTERY.md"], { stdio: "inherit" });
      console.log("[verify-pre-commit] docs/audit/USMCA-EXHAUSTIVE-BATTERY.md regenerated and staged");
    }
  } catch (e) {
    // non-fatal: if git is not available (CI pre-commit context) skip gracefully
    console.warn("[verify-pre-commit] battery-doc auto-regen skipped:", e.message);
  }
})();

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
