export default {
  name: "verify:driver-company-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-company-scope.mjs"]);
  },
};
