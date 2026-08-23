export default {
  name: "verify:driver-team-money-writes-membership-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-team-money-writes-membership-scope.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-team-money-writes-membership-scope.mjs"]);
  },
};
