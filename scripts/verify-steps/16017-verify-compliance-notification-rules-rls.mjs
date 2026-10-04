export default {
  name: "verify:compliance-notification-rules-rls",
  run(ctx) {
    ctx.run("node", ["scripts/verify-compliance-notification-rules-rls.mjs"]);
  },
};
