import { execFileSync } from "node:child_process";

export default {
  name: "relay-status-not-hardcoded",
  run: async () => {
    execFileSync(process.execPath, ["scripts/verify-relay-status-not-hardcoded.mjs"], { stdio: "inherit" });
  },
};
