export default {
  name: "verify:detail-types-owner-lock",
  run(ctx) {
    ctx.run("node", ["scripts/verify-detail-types-owner-lock.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-detail-types-owner-lock.mjs"]);
  },
};
