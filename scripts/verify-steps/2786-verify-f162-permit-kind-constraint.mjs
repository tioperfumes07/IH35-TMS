import { execFileSync } from "node:child_process";

export default {
  name: "f162-permit-kind-constraint",
  run: async () => {
    execFileSync(process.execPath, ["scripts/verify-f162-permit-kind-constraint.mjs"], { stdio: "inherit" });
  },
};
