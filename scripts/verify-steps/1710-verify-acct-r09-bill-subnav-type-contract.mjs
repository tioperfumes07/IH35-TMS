export default {
  name: "verify-acct-r09-bill-subnav-type-contract",
  run(ctx) {
    // BANK-F91512 — TypeTabBar leftover #94a3b8 refuse (this EVEN already owns the guard).
    ctx.run("node", ["scripts/verify-acct-r09-bill-subnav-type-contract.mjs"]);
    ctx.run("node", ["scripts/verify-acct-r09-bill-subnav-type-contract.mjs", "--selftest"]);
  },
};
