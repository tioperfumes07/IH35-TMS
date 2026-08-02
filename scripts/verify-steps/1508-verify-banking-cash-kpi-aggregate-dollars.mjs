// Banking Layer E — cash posting aggregate must use dollars and match per-account tile derivation.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "..", "verify-banking-cash-kpi-aggregate-dollars.mjs");

export default {
  name: "banking-cash-kpi-aggregate-dollars",
  run: async () => {
    const res = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
    if (res.status !== 0) {
      throw new Error(
        "banking-cash-kpi-aggregate-dollars FAIL:\n" + `${res.stdout ?? ""}${res.stderr ?? ""}`.trim()
      );
    }
  },
};
