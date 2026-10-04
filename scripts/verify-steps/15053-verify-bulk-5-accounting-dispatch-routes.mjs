export default {
  name: "verify:bulk-5-accounting-dispatch-routes",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bulk-5-accounting-dispatch-routes.mjs"]);
  },
};
