import { fileURLToPath } from "node:url";
import { createVerifyPrecommitContext } from "./_context.mjs";
import { runStep } from "./_runner.mjs";

const commands = [
  ["node", ["scripts/verify-receipts-page-query-error.mjs", "--selftest"]],
  ["node", ["scripts/verify-receipts-page-query-error.mjs"]],
];

export async function runReceiptsPageQueryErrorStep(ctx) {
  for (const [command, args] of commands) {
    const status = ctx.runAllowFailure(command, args);
    if (status !== 0) throw new Error(`receipts-page-query-error step failed: ${command} ${args.join(" ")}`);
  }
}

const step = {
  name: "receipts-page-query-error-contract-and-selftest",
  run: runReceiptsPageQueryErrorStep,
};

async function selftest() {
  const calls = [];
  await runStep({
    index: 1,
    total: 1,
    name: step.name,
    run: () => step.run({ runAllowFailure: (command, args) => { calls.push([command, args]); return 0; } }),
  });
  if (calls.length !== commands.length || !calls[0][1].includes("--selftest")) {
    throw new Error("step selftest did not execute query-error selftest and production guard");
  }
  let rejected = false;
  try {
    await runStep({
      index: 1,
      total: 1,
      name: step.name,
      run: () => step.run({ runAllowFailure: (_command, args) => args.includes("--selftest") ? 17 : 0 }),
    });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("planted query-error selftest failure did not propagate through runStep");
  console.log("947 verify-step --selftest PASS — commands executed and planted failure propagated");
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--selftest")) {
  await selftest();
}
if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--run")) {
  const ctx = createVerifyPrecommitContext(process.cwd());
  await runStep({ index: 1, total: 1, name: step.name, run: () => step.run(ctx) });
}

export default step;
