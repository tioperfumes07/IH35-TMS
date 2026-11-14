import { existsSync } from "node:fs";
import { homedir } from "node:os";
// Guard needs DATABASE_URL. Supply via .env if it exists, else via ih35-gate.env.
const dotEnv = new URL("../../.env", import.meta.url).pathname;
const gateEnv = `${homedir()}/.ih35-gate.env`;
const envArg = existsSync(dotEnv) ? `--env-file=${dotEnv}` : existsSync(gateEnv) ? `--env-file=${gateEnv}` : "";
export default {
  script: `${envArg} scripts/verify-no-orphan-migration-ledger-entries.mjs`.trim(),
  label: "verify-no-orphan-migration-ledger-entries",
};
