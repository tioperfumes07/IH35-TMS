import { fileURLToPath } from "node:url";
import { createVerifyPrecommitContext } from "./_context.mjs";
import { runStep } from "./_runner.mjs";

const commands = [
  ["node", ["scripts/verify-custvend-sortable-headers.mjs", "--selftest"], null],
  ["node", ["scripts/verify-custvend-sortable-headers.mjs"], null],
];

export async function runCustvendSortableHeadersStep(ctx) {
  for (const [command, args] of commands) {
    const status = ctx.run(command, args);
    if (status !== 0) {
      throw new Error(`934-custvend-sortable-headers step failed: ${command} ${args.join(" ")}`);
    }
  }
}

const step = {
  name: "934-verify-custvend-sortable-headers",
  run: runCustvendSortableHeadersStep,
};

async function selftest() {
  const calls = [];
  const ctx = {
    ROOT: process.cwd(),
    run(command, args) {
      calls.push([command, args]);
      return 0;
    },
  };
  await runStep({ index: 1, total: 1, name: step.name, run: () => step.run(ctx) });
  if (calls.length !== commands.length || !calls[0][1].includes("--selftest")) {
    throw new Error("step selftest did not execute the guard selftest + live scan");
  }

  let rejected = false;
  try {
    await runStep({
      index: 1,
      total: 1,
      name: step.name,
      run: () =>
        step.run({
          ROOT: process.cwd(),
          run: (_command, args) => (args.includes("--selftest") ? 0 : 1),
        }),
    });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("planted live-scan failure did not propagate through runStep");
  console.log("934 verify-step --selftest PASS — guard selftest + live scan executed, planted failure propagated");
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--selftest")) {
  await selftest();
}
if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--run")) {
  const ctx = createVerifyPrecommitContext(process.cwd());
  await runStep({ index: 1, total: 1, name: step.name, run: () => step.run(ctx) });
}

export default step;
