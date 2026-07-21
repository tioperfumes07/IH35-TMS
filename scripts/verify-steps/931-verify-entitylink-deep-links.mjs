import path from "node:path";
import { fileURLToPath } from "node:url";
import { createVerifyPrecommitContext } from "./_context.mjs";
import { runStep } from "./_runner.mjs";

const commands = [
  ["node", ["scripts/verify-entitylink-deep-links.mjs", "--selftest"], null],
  ["node", ["scripts/verify-entitylink-deep-links.mjs"], null],
  ["npx", ["vitest", "run", "src/pages/accounting/__tests__/reverse-drill-through.behavior.test.tsx"], "apps/frontend"],
];

export async function runEntityLinkDeepLinksStep(ctx) {
  for (const [command, args, cwd] of commands) {
    const status = ctx.runAllowFailure(command, args, cwd ? { cwd: path.join(ctx.ROOT, cwd) } : undefined);
    if (status !== 0) throw new Error(`entitylink-deep-links step failed: ${command} ${args.join(" ")}`);
  }
}

const step = {
  name: "entitylink-deep-links-contract-selftest-behavior",
  run: runEntityLinkDeepLinksStep,
};

async function selftest() {
  const calls = [];
  const ctx = {
    ROOT: process.cwd(),
    runAllowFailure(command, args, options) {
      calls.push([command, args, options]);
      return 0;
    },
  };
  await runStep({ index: 1, total: 1, name: step.name, run: () => step.run(ctx) });
  if (
    calls.length !== commands.length ||
    !calls[0][1].includes("--selftest") ||
    !calls[2][1].includes("src/pages/accounting/__tests__/reverse-drill-through.behavior.test.tsx")
  ) {
    throw new Error("step selftest did not execute deep-link guard, selftest, and behavior test");
  }
  let rejected = false;
  try {
    await runStep({
      index: 1,
      total: 1,
      name: step.name,
      run: () => step.run({
        ROOT: process.cwd(),
        runAllowFailure: (_command, args) =>
          args.includes("src/pages/accounting/__tests__/reverse-drill-through.behavior.test.tsx") ? 23 : 0,
      }),
    });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("planted frontend behavior failure did not propagate through runStep");
  console.log("931 verify-step --selftest PASS — behavior command executed and planted failure propagated");
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--selftest")) {
  await selftest();
}
if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--run")) {
  const ctx = createVerifyPrecommitContext(process.cwd());
  await runStep({ index: 1, total: 1, name: step.name, run: () => step.run(ctx) });
}

export default step;
