// RECON-CLOSED-SESSION-NO-AUTHORIZED-PATH / LAW-EDITABLE-BY-PERMISSION-ALWAYS-TRACEABLE. Step
// 10177 · CC-1 lane.
export default {
  name: "reconciliation-session-reopen-authorized-path",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reconciliation-session-reopen-authorized-path.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-reconciliation-session-reopen-authorized-path.mjs"]);
  },
};
