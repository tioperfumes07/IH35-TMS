export default {
  name: "verify:customer-routes-registered",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-routes-registered.mjs"]);
  },
};
