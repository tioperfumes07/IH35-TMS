// TOOL-F03 — verify-step numbers must come from the branch's lane parity (Claude ODD / Cursor EVEN).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "..", "verify-verify-step-lane-band.mjs");

export default {
  name: "verify-step-lane-band",
  run: async () => {
    const self = spawnSync(process.execPath, [SCRIPT, "--selftest"], { encoding: "utf8" });
    if (self.status !== 0) {
      throw new Error("verify-step-lane-band SELFTEST FAIL:\n" + `${self.stdout ?? ""}${self.stderr ?? ""}`.trim());
    }
    const res = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
    if (res.status !== 0) {
      throw new Error("verify-step-lane-band FAIL:\n" + `${res.stdout ?? ""}${res.stderr ?? ""}`.trim());
    }
  },
};
