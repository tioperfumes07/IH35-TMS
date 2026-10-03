// KILL THE SECOND SYSTEM tables 2-5 (CC-1): driver_finance.escrow_balances' amounts and escrow_ledger.running_balance_cents
// died with migration 202615380100 (escrow_accounts.balance_cents with 202615380000) — the balance is the 2100-00-nnn GL,
// served by driver_finance.v_escrow_balances / v_driver_escrow_balance. Static: no later migration adds a dead column
// back. The live half (columns absent, the summary view equals the GL per driver) is verify-escrow-equals-its-gl in the gate.
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deadColumnsStayDead } from "../verify-escrow-equals-its-gl.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export default {
  name: "escrow-balances-equals-its-gl",
  run: async () => {
    const dir = join(ROOT, "db/migrations");
    const files = readdirSync(dir).filter((f) => /^\d{12}_.*\.sql$/.test(f)).map((f) => join("db/migrations", f));
    const problems = deadColumnsStayDead({ files, read: (f) => readFileSync(join(ROOT, f), "utf8") });
    if (problems.length) throw new Error("escrow-balances-equals-its-gl FAIL:\n  " + problems.join("\n  "));
  },
};
