// TOOL-F04 — a migration that mutates EXISTING rows must record a rehearsal against a copy of prod.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "..", "verify-data-migrations-rehearsed.mjs");

export default {
  name: "data-migrations-rehearsed",
  run: async () => {
    const self = spawnSync(process.execPath, [SCRIPT, "--selftest"], { encoding: "utf8" });
    if (self.status !== 0) {
      throw new Error("data-migrations-rehearsed SELFTEST FAIL:\n" + `${self.stdout ?? ""}${self.stderr ?? ""}`.trim());
    }
    const res = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
    if (res.status !== 0) {
      throw new Error("data-migrations-rehearsed FAIL:\n" + `${res.stdout ?? ""}${res.stderr ?? ""}`.trim());
    }
  },
};
