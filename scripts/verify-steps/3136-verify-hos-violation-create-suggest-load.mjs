// Rule 17: verify-steps ONLY — never edit package.json / ci.yml for wiring.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "..", "verify-hos-violation-create-suggest-load.mjs");

export default {
  name: "verify-hos-violation-create-suggest-load",
  async run(ctx) {
    const self = spawnSync(process.execPath, [SCRIPT, "--selftest"], { encoding: "utf8" });
    if (self.status !== 0) {
      throw new Error(
        "verify-hos-violation-create-suggest-load SELFTEST FAIL:\n" +
          `${self.stdout ?? ""}${self.stderr ?? ""}`.trim(),
      );
    }
    await ctx.run("node", [SCRIPT]);
  },
};
