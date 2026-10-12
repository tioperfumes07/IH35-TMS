import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-new-units-have-gps-or-deactivation-reason.mjs", "--selftest"], { stdio: "inherit" });
// 443.100: the live half runs in the live-DB job (ci.yml required-live-load-guard); the selftest stays here.
