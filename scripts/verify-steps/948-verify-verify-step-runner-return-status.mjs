import { fileURLToPath } from "node:url";
import { createVerifyPrecommitContext } from "./_context.mjs";
import { runStep } from "./_runner.mjs";

const commands = [
  ["node", ["scripts/verify-verify-step-runner-return-status.mjs", "--selftest"]],
  ["node", ["scripts/verify-verify-step-runner-return-status.mjs"]],
];

export async function runVerifyStepRunnerReturnStatusStep(ctx) {
  for (const [command, args] of commands) {
    const status = ctx.run(command, args);
    if (status !== 0) {
      throw new Error(`verify-step-runner-return-status step failed: ${command} ${args.join(" ")}`);
    }
  }
}

const step = {
  name: "verify-step-runner-return-status-contract-and-selftest",
  run: runVerifyStepRunnerReturnStatusStep,
};

async function selftest() {
  const calls = [];
  await runStep({
    index: 1,
    total: 1,
    name: step.name,
    run: () => step.run({ run: (command, args) => { calls.push([command, args]); return 0; } }),
  });
  if (calls.length !== commands.length || !calls[0][1].includes("--selftest")) {
    throw new Error("step selftest did not execute runner selftest and production guard");
  }
  let rejected = false;
  try {
    await runStep({
      index: 1,
      total: 1,
      name: step.name,
      run: () => step.run({ run: (_command, args) => args.includes("--selftest") ? 17 : 0 }),
    });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("planted runner-guard failure did not propagate through runStep");

  // Direct proof that return-1 from a step.run is no longer discarded by runStep.
  rejected = false;
  try {
    await runStep({ index: 1, total: 1, name: "direct-return-1", run: () => 1 });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("runStep still discards numeric non-zero status");

  console.log("948 verify-step --selftest PASS — commands executed and planted failures propagated");
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--selftest")) {
  await selftest();
}
if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--run")) {
  const ctx = createVerifyPrecommitContext(process.cwd());
  await runStep({ index: 1, total: 1, name: step.name, run: () => step.run(ctx) });
}

export default step;
