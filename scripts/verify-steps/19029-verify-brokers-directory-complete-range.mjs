export default {
  name: "verify:brokers-directory-complete-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-brokers-directory-complete-range.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-brokers-directory-complete-range.mjs"]);
  },
};
