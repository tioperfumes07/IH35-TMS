// SAF-425C — audit.audit_events has uuid/created_at, never id/emitted_at (phantom-column 500).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "..", "verify-audit-events-column-names.mjs");

export default {
  name: "audit-events-column-names",
  run: async () => {
    const self = spawnSync(process.execPath, [SCRIPT, "--selftest"], { encoding: "utf8" });
    if (self.status !== 0) throw new Error("audit-events-column-names SELFTEST FAIL:\n" + `${self.stdout ?? ""}${self.stderr ?? ""}`.trim());
    const res = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
    if (res.status !== 0) throw new Error("audit-events-column-names FAIL:\n" + `${res.stdout ?? ""}${res.stderr ?? ""}`.trim());
  },
};
