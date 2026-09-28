export default {
  name: "verify:projected-cash-date-equals-delivery",
  run(ctx) {
    ctx.run("node", ["scripts/verify-projected-cash-date-equals-delivery.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-projected-cash-date-equals-delivery.mjs"]);
  },
};
