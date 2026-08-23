export default {
  name: "verify:lists-names-brokers-connectivity-exact",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lists-names-brokers-connectivity-exact.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-lists-names-brokers-connectivity-exact.mjs"]);
  },
};
