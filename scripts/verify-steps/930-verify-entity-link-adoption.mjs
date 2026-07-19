import { fileURLToPath } from "node:url";
import { createVerifyPrecommitContext } from "./_context.mjs";
import { runStep } from "./_runner.mjs";

const commands = [
  ["node", ["scripts/verify-entity-link-adoption.mjs", "--selftest"]],
  ["node", ["scripts/verify-entity-link-adoption.mjs"]],
];

export async function runEntityLinkAdoptionStep(ctx) {
  for (const [command, args] of commands) {
    const status = ctx.run(command, args);
    if (status !== 0) throw new Error(`entity-link-adoption step failed: ${command} ${args.join(" ")}`);
  }
}

const step = {
  name: "entity-link-adoption-contract-and-selftest",
  run: runEntityLinkAdoptionStep,
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
    throw new Error("step selftest did not execute adoption selftest and production guard");
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
  if (!rejected) throw new Error("planted adoption selftest failure did not propagate through runStep");
  console.log("930 verify-step --selftest PASS — commands executed and planted failure propagated");
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--selftest")) {
  await selftest();
}
if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--run")) {
  const ctx = createVerifyPrecommitContext(process.cwd());
  await runStep({ index: 1, total: 1, name: step.name, run: () => step.run(ctx) });
}

export default step;
