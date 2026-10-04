export default {
  name: "verify:eld-audit-trail",
  run(ctx) {
    ctx.run("node", ["scripts/verify-eld-audit-trail.mjs"]);
  },
};
