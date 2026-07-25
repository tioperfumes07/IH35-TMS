export default {
  name: "verify:catalog-registry-code-parity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-catalog-registry-code-parity.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-catalog-registry-code-parity.mjs"]);
  },
};
