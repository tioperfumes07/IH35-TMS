#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["driver","connectivity","qbo_chrome"],"leaves":["drivers.modal.create_driver"],"task":"DRIVER-F6658-INVITE-REQUEST-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/components/drivers/CreateDriverModal.tsx";
const source = fs.readFileSync(file, "utf8");

function failures(input = source) {
  const confirmBlock = input.match(/onConfirm=\{async \(\) => \{([\s\S]*?)\n        \}\}/)?.[1] ?? "";
  return [
    ["invite generation exists", /const inviteGenerationRef = useRef\(0\)/.test(input)],
    ["new summary retires prior invite", /inviteGenerationRef\.current \+= 1;[\s\S]{0,180}setInvitePending\(false\);[\s\S]{0,180}setCreateSummary\(\{/.test(input)],
    ["summary close retires complete invite state", /const closeCreateSummary = useCallback\(\(\) => \{[\s\S]*?inviteGenerationRef\.current \+= 1;[\s\S]*?setInvitePending\(false\);[\s\S]*?setInviteSent\(false\);[\s\S]*?setInviteConfirmOpen\(false\);[\s\S]*?setCreateSummary\(null\)/.test(input)],
    ["all summary shells share close boundary", (input.match(/onClose=\{closeCreateSummary\}/g) ?? []).length === 2 && input.includes("onClick={closeCreateSummary}")],
    ["invite snapshots immutable identity", /const generation = inviteGenerationRef\.current;[\s\S]*const driverId = createSummary\.driver_id;[\s\S]*const phone = createSummary\.phone;/.test(confirmBlock)],
    ["writer uses submitted driver", /resendDriverInvite\(driverId\)/.test(confirmBlock)],
    ["success rejects stale summary", /if \(generation !== inviteGenerationRef\.current\) return;[\s\S]*setInviteSent\(true\)/.test(confirmBlock)],
    ["error rejects stale summary", /catch \(error\) \{[\s\S]*if \(generation !== inviteGenerationRef\.current\) return;[\s\S]*Could not send invite/.test(confirmBlock)],
    ["finally cannot clear next request", /if \(generation === inviteGenerationRef\.current\) setInvitePending\(false\)/.test(confirmBlock)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("resendDriverInvite(driverId)", "resendDriverInvite(createSummary.driver_id)"),
    source.replace("const phone = createSummary.phone;", "const phone = createSummary?.phone;"),
    source.replace("if (generation !== inviteGenerationRef.current) return;\n            setInviteSent(true);", "setInviteSent(true);"),
    source.replace("if (generation === inviteGenerationRef.current) setInvitePending(false);", "setInvitePending(false);"),
    source.replace("onClose={closeCreateSummary}", "onClose={() => setCreateSummary(null)}"),
  ];
  const escaped = mutations.filter((mutation) => failures(mutation).length === 0);
  if (escaped.length) {
    console.error(`verify-create-driver-invite-request-lifecycle SELFTEST FAIL — ${escaped.length}/5 mutations escaped`);
    process.exit(1);
  }
  console.log("verify-create-driver-invite-request-lifecycle selftest PASS — 5/5 stale-invite mutations rejected");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-create-driver-invite-request-lifecycle FAIL — ${missing.join("; ")}`);
  process.exit(1);
}
console.log("verify-create-driver-invite-request-lifecycle PASS — invite writes and callbacks remain bound to one driver summary");
