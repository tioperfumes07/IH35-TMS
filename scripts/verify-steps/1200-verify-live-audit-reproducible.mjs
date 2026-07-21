export default {
  name: "verify:live-audit-reproducible",
  run(ctx) {
    ctx.run("node", ["scripts/verify-live-audit-reproducible.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-live-audit-reproducible.mjs"]);
  },
};
