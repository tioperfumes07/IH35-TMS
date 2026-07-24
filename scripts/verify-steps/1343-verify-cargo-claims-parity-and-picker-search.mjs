export default {
  name: "verify:cargo-claims-parity-and-picker-search",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cargo-claims-parity-and-picker-search.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-cargo-claims-parity-and-picker-search.mjs"]);
  },
};
