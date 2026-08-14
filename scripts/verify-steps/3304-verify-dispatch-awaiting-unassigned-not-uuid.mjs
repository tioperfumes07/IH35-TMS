export default {
  name: "verify:dispatch-awaiting-unassigned-not-uuid",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-awaiting-unassigned-not-uuid.mjs"]);
  },
};
