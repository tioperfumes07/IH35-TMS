// Step 1745 — internal failure-reason codes must not be rendered as operator copy. Prod showed
// "Factoring balance unverifiable: faro_contract_entity_mismatch" on Home for an entity that simply
// has no factoring contract.
export default {
  name: "verify:no-raw-reason-code-in-ui",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-raw-reason-code-in-ui.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-raw-reason-code-in-ui.mjs"]);
  },
};
