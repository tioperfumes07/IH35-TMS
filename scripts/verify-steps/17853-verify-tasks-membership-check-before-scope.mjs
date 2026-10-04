export default {
  name: "verify:tasks-membership-check-before-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-tasks-membership-check-before-scope.mjs"]);
  },
};
