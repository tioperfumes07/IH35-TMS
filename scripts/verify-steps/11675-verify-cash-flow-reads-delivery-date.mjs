export default {
  name: "verify:cash-flow-reads-delivery-date",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-flow-reads-delivery-date.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-cash-flow-reads-delivery-date.mjs"]);
  },
};
