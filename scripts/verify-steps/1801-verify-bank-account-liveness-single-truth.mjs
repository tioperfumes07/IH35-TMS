// BANK-F14 — deactivated bank accounts may not be is_active; the cash total must filter both flags.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "..", "verify-bank-account-liveness-single-truth.mjs");

export default {
  name: "bank-account-liveness-single-truth",
  run: async () => {
    const res = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
    if (res.status !== 0) {
      throw new Error("bank-account-liveness-single-truth FAIL:\n" + `${res.stdout ?? ""}${res.stderr ?? ""}`.trim());
    }
  },
};
