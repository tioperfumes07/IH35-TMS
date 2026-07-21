import { fileURLToPath } from "node:url";
import { createVerifyPrecommitContext } from "./_context.mjs";
import { runStep } from "./_runner.mjs";

const commands = [
  ["node", ["scripts/verify-reports-library-routes-no-any-client.mjs", "--selftest"]],
  ["node", ["scripts/verify-reports-library-routes-no-any-client.mjs"]],
];

export async function runReportsLibraryRoutesNoAnyClientStep(ctx) {
  for (const [command, args] of commands) {
    const status = ctx.runAllowFailure(command, args);
    if (status !== 0) throw new Error(`reports-library-routes-no-any-client step failed: ${command} ${args.join(" ")}`);
  }
}

const step = {
  name: "reports-library-routes-no-any-client-contract-and-selftest",
  run: runReportsLibraryRoutesNoAnyClientStep,
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
    throw new Error("step selftest did not execute selftest and production guard");
  }
  let rejected = false;
  try {
    await runStep({
      index: 1,
      total: 1,
      name: step.name,
      run: () => step.run({ runAllowFailure: (_command, args) => (args.includes("--selftest") ? 17 : 0) }),
    });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("planted failure did not propagate through runStep");
  console.log("950 verify-step --selftest PASS");
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--selftest")) {
  await selftest();
}
if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--run")) {
  const ctx = createVerifyPrecommitContext(process.cwd());
  await runStep({ index: 1, total: 1, name: step.name, run: () => step.run(ctx) });
}

export default step;
