// Banking Layer E — Cash posting KPI must not double-convert after API returns dollars (#4011 + residual).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export default {
  name: "banking-cash-kpi-no-double-convert",
  run: async () => {
    for (const script of [
      "verify-banking-cash-kpi-cents-unit.mjs",
      "verify-banking-cash-kpi-aggregate-dollars.mjs",
    ]) {
      const res = spawnSync(process.execPath, [path.join(HERE, "..", script), "--selftest"], {
        encoding: "utf8",
      });
      if (res.status !== 0) {
        throw new Error(`${script} selftest FAIL:\n${res.stdout ?? ""}${res.stderr ?? ""}`.trim());
      }
      const run = spawnSync(process.execPath, [path.join(HERE, "..", script)], { encoding: "utf8" });
      if (run.status !== 0) {
        throw new Error(`${script} FAIL:\n${run.stdout ?? ""}${run.stderr ?? ""}`.trim());
      }
    }
  },
};
