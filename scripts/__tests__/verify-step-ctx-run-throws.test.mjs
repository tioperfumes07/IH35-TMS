import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createVerifyPrecommitContext } from "../verify-steps/_context.mjs";
import { runStep } from "../verify-steps/_runner.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ctx = createVerifyPrecommitContext(ROOT);
const SILENT = { stdio: "ignore" };
const exit = (code) => ["node", ["-e", `process.exit(${code})`]];

test("ctx.run returns 0 on a clean child without throwing", () => {
  assert.equal(ctx.run(...exit(0), SILENT), 0);
});

test("ctx.run throws on a non-zero child exit (fail closed)", () => {
  assert.throws(() => ctx.run(...exit(5), SILENT), /command failed \(exit 5\)/);
});

test("ctx.run throws when the command cannot be spawned", () => {
  assert.throws(() => ctx.run("ih35-nonexistent-command-xyz", [], SILENT), /could not spawn/);
});

test("ctx.runAllowFailure returns the non-zero status without throwing", () => {
  assert.equal(ctx.runAllowFailure(...exit(6), SILENT), 6);
});

test("ctx.runAllowFailure returns 0 on a clean child", () => {
  assert.equal(ctx.runAllowFailure(...exit(0), SILENT), 0);
});

test("a step that only calls ctx.run (discards status) still fails closed via runStep", async () => {
  const step = {
    name: "bare-ctx-run",
    run: (c) => {
      c.run(...exit(0), SILENT);
      c.run(...exit(1), SILENT); // status discarded; must still fail closed
    },
  };
  await assert.rejects(
    () => runStep({ index: 1, total: 1, name: step.name, run: () => step.run(ctx) }),
    /command failed \(exit 1\)/,
  );
});

test("the wired 1201 verify-step --selftest passes", async () => {
  const { spawnSync } = await import("node:child_process");
  const res = spawnSync(process.execPath, ["scripts/verify-steps/1201-verify-ctx-run-throws.mjs", "--selftest"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(res.status, 0, res.stderr || res.stdout);
  assert.match(res.stdout, /1201 verify-step --selftest PASS/);
});
