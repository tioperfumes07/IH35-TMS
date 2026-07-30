// BANK-F13 — superseded bank-transaction copies must not be categorizable; suppression needs an ACTIVE twin.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "..", "verify-bank-superseded-duplicate-suppression.mjs");

export default {
  name: "bank-superseded-duplicate-suppression",
  run: async () => {
    const res = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
    if (res.status !== 0) {
      throw new Error("bank-superseded-duplicate-suppression FAIL:\n" + `${res.stdout ?? ""}${res.stderr ?? ""}`.trim());
    }
  },
};
