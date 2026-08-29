import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "verify-vendor-accessible-company-ids-bind.mjs",
);

export default {
  name: "verify-vendor-accessible-company-ids-bind",
  async run(ctx) {
    const self = spawnSync(process.execPath, [SCRIPT, "--selftest"], { encoding: "utf8" });
    if (self.status !== 0) {
      throw new Error(
        `verify-vendor-accessible-company-ids-bind SELFTEST FAIL:\n${(self.stdout ?? "") + (self.stderr ?? "")}`.trim(),
      );
    }
    await ctx.run("node", [SCRIPT]);
  },
};
