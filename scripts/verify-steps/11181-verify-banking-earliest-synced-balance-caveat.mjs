export default {
  name: "verify:banking-earliest-synced-balance-caveat",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-earliest-synced-balance-caveat.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-banking-earliest-synced-balance-caveat.mjs"]);
  },
};
