export default {
  name: "verify:wo-time-entry-identity-audit-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-wo-time-entry-identity-audit-lifecycle.mjs"]);
  },
};
