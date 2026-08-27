export default {
  name: "verify:gap45-cash-flow-operating-balance-authoritative-source",
  run(ctx) {
    ctx.run("node", ["scripts/verify-gap45-cash-flow-operating-balance-authoritative-source.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-gap45-cash-flow-operating-balance-authoritative-source.mjs"]);
  },
};
