export default {
  name: "verify:user-detail-linked-read-failure-exclusion",
  run(ctx) {
    ctx.run("node", ["scripts/verify-user-detail-linked-read-failure-exclusion.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-user-detail-linked-read-failure-exclusion.mjs"]);
  },
};
