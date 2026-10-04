export default {
  name: "verify:customer-free-time-catalog",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-free-time-catalog.mjs"]);
  },
};
