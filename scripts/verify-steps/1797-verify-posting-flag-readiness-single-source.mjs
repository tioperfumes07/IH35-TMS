// ACCT-F18 — posting-flag requirements have ONE source, and readiness surfaces armed-but-blocked.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "..", "verify-posting-flag-readiness-single-source.mjs");

export default {
  name: "posting-flag-readiness-single-source",
  run: async () => {
    const res = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
    if (res.status !== 0) {
      throw new Error(
        "posting-flag-readiness-single-source FAIL:\n" + `${res.stdout ?? ""}${res.stderr ?? ""}`.trim()
      );
    }
  },
};
