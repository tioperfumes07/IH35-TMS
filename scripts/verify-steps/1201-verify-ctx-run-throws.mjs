import { fileURLToPath } from "node:url";
import { createVerifyPrecommitContext } from "./_context.mjs";
import { runStep } from "./_runner.mjs";

// Rule 17: auto-discovered verify-step. Do NOT edit package.json / locked-guards / ci.yml.
// Wires the pipeline-truth guard that proves ctx.run() fails closed (throws on non-zero)
// and runAllowFailure() stays non-throwing for intentional probes.
const commands = [
  ["node", ["scripts/verify-verify-step-ctx-run-throws.mjs", "--selftest"]],
  ["node", ["scripts/verify-verify-step-ctx-run-throws.mjs"]],
];

export async function runCtxRunThrowsStep(ctx) {
  // Bare calls on purpose: ctx.run() now throws on any non-zero child exit, so this
  // step fails closed without inspecting the status (the pattern the guard protects).
  for (const [command, args] of commands) {
    ctx.run(command, args);
  }
}

const step = {
  name: "verify-ctx-run-throws-contract-and-selftest",
  run: runCtxRunThrowsStep,
};

async function selftest() {
  const calls = [];
  await runStep({
    index: 1,
    total: 1,
    name: step.name,
    run: () =>
      step.run({
        run: (command, args) => {
          calls.push([command, args]);
        },
      }),
  });
  if (calls.length !== commands.length || !calls[0][1].includes("--selftest")) {
    throw new Error("step selftest did not execute the guard selftest and production guard");
  }

  // Model the real fail-closed behavior: ctx.run() THROWS on the production guard.
  let rejected = false;
  try {
    await runStep({
      index: 1,
      total: 1,
      name: step.name,
      run: () =>
        step.run({
          run: (_command, args) => {
            if (!args.includes("--selftest")) {
              throw new Error("verify:pre-commit command failed (exit 1): planted ctx.run failure");
            }
          },
        }),
    });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("planted ctx.run failure did not propagate through runStep");
  console.log("1201 verify-step --selftest PASS — guard executed and planted ctx.run failure propagated");
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--selftest")) {
  await selftest();
}
if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--run")) {
  const ctx = createVerifyPrecommitContext(process.cwd());
  await runStep({ index: 1, total: 1, name: step.name, run: () => step.run(ctx) });
}

export default step;
