export default {
  name: "verify-safety-b29-cargo-customer-reason-search",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-safety-b29-cargo-customer-reason-search.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-safety-b29-cargo-customer-reason-search.mjs"]);
  },
};
