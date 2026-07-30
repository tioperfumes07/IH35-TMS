// TOOL-F01 — the local pre-push freshness gate must agree with CI's (overlap, not zero-behind).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "..", "verify-precheck-freshness-overlap.mjs");

export default {
  name: "precheck-freshness-overlap",
  run: async () => {
    const res = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
    if (res.status !== 0) {
      throw new Error(
        "precheck-freshness-overlap FAIL:\n" + `${res.stdout ?? ""}${res.stderr ?? ""}`.trim()
      );
    }
  },
};
