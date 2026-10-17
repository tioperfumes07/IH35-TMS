/** R443.117: the historical entry point now enforces native GL, never parallel books. */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../");
describe("native bill-payment writer contract", () => {
  for (const args of [[], ["--selftest"]]) {
    it("enforces the real AST contract " + args.join(" "), () => {
      const result = spawnSync(process.execPath, [path.join(root, "scripts/verify-qbo-bill-payment-subledger-only.mjs"), ...args], { encoding: "utf8" });
      expect(result.error, result.stderr).toBeUndefined();
      expect(result.signal, result.stderr).toBeNull();
      expect(result.status, result.stdout + result.stderr).toBe(0);
      // Heavy CI peel: this test spawns a node process running an AST guard (--selftest ~2 s idle). Under CI's
      // parallel suite it crossed vitest's 5 s default twice on main (run 39025600792) — a load timeout, not a
      // contract failure. The assertions are unchanged; only the time budget for the child process.
    }, 60_000);
  }
});
