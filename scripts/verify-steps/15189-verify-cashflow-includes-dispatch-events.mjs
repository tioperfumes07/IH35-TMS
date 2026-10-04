export default {
  name: "verify:cashflow-includes-dispatch-events",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cashflow-includes-dispatch-events.mjs"]);
  },
};
