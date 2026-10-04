export default {
  name: "verify:no-service-imports-an-http-route-module",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-service-imports-an-http-route-module.mjs"]);
  },
};
