import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "verify-guard-selftests-are-real.mjs",
);

export default {
  name: "verify-guard-selftests-are-real",
  async run(ctx) {
    const self = spawnSync(process.execPath, [SCRIPT, "--selftest"], { encoding: "utf8" });
    if (self.status !== 0) {
      throw new Error(
        `verify-guard-selftests-are-real SELFTEST FAIL:\n${(self.stdout ?? "") + (self.stderr ?? "")}`.trim(),
      );
    }
    await ctx.run("node", [SCRIPT]);
  },
};
