export default {
  name: "verify:eld-audit-trail-status-driven-branches",
  run(ctx) {
    ctx.run("node", ["scripts/verify-eld-audit-trail-status-driven-branches.mjs"]);
  },
};
