export default {
  name: "verify:transaction-register-gl-je-link",
  run(ctx) {
    ctx.run("node", ["scripts/verify-transaction-register-gl-je-link.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-transaction-register-gl-je-link.mjs"]);
  },
};
