export default {
  name: "verify:settlement-status-approved-runs-approval-gate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-status-approved-runs-approval-gate.mjs"]);
  },
};
