export default {
  name: "verify:dispatch-cancel-approval-gate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-cancel-approval-gate.mjs"]);
  },
};
