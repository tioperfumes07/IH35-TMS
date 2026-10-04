export default {
  name: "verify:driver-detail-company-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-detail-company-scope.mjs"]);
  },
};
