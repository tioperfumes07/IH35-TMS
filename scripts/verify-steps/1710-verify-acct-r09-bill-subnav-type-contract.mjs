export default {
  name: "verify-acct-r09-bill-subnav-type-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-acct-r09-bill-subnav-type-contract.mjs"]);
    ctx.run("node", ["scripts/verify-acct-r09-bill-subnav-type-contract.mjs", "--selftest"]);
  },
};
