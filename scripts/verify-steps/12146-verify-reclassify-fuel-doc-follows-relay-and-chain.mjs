// LST-F11163 — a Relay fill's document and a moved line's root document both follow the ledger on reclassify. Static.
export default {
  name: "verify:reclassify-fuel-doc-follows-relay-and-chain",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reclassify-fuel-doc-follows-relay-and-chain.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-reclassify-fuel-doc-follows-relay-and-chain.mjs"]);
  },
};
