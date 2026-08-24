#!/usr/bin/env node
/** DRV-F6334 — Driver push registration must not reject silently or permit duplicate attempts. */
import fs from "node:fs";

const settings = fs.readFileSync("apps/frontend/src/pages/driver/DriverSettingsPage.tsx", "utf8");
const login = fs.readFileSync("apps/frontend/src/pages/driver/DriverLoginPage.tsx", "utf8");

function audit(s, l) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  need(/const \[pushPending, setPushPending\]/.test(s), "settings must track push registration pending state");
  need(/setPushPending\(true\);[\s\S]*try \{[\s\S]*await registerDriverWebPush[\s\S]*catch \(error\)[\s\S]*finally \{[\s\S]*setPushPending\(false\)/.test(s), "settings must catch and finalize registration");
  need(/error instanceof Error \? error\.message/.test(s), "settings must preserve registration error detail");
  need(/disabled=\{pushPending\}/.test(s), "settings must prevent duplicate registration attempts");
  need(/role="status"/.test(s), "registration result must be announced");
  need(/registerDriverWebPush\(vapid\)\.catch\(\(\) => undefined\)/.test(l), "best-effort login registration must consume rejection");
  return failures;
}

const failures = audit(settings, login);
if (failures.length) {
  console.error(`verify-driver-push-registration-errors FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [settings.replace(/\n    \} catch \(error\) \{[\s\S]*?\n    \} finally \{/, "\n    } finally {"), login],
    [settings.replace(/\n    setPushPending\(true\);/, ""), login],
    [settings.replace(/ disabled=\{pushPending\}/, ""), login],
    [settings.replace(' role="status"', ""), login],
    [settings.replace("error instanceof Error ? error.message", '"Registration failed"'), login],
    [settings, login.replace(".catch(() => undefined)", "")],
  ];
  for (const [index, [s, l]] of mutations.entries()) {
    if ((s === settings && l === login) || audit(s, l).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-driver-push-registration-errors SELFTEST PASS — ${mutations.length} mutations detected`);
}

console.log("verify-driver-push-registration-errors PASS — registration errors are handled on both driver surfaces");
