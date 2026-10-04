export default {
  name: "verify:vehicle-profile-audit-coverage",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vehicle-profile-audit-coverage.mjs"]);
  },
};
