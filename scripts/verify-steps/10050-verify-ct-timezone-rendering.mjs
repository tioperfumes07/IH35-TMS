import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "verify-ct-timezone-rendering.mjs",
);

export default {
  name: "verify-ct-timezone-rendering",
  async run(ctx) {
    const self = spawnSync(process.execPath, [SCRIPT, "--selftest"], { encoding: "utf8" });
    if (self.status !== 0) {
      throw new Error(
        `verify-ct-timezone-rendering SELFTEST FAIL:\n${(self.stdout ?? "") + (self.stderr ?? "")}`.trim(),
      );
    }
    await ctx.run("node", [SCRIPT]);
  },
};
