export default {
  name: "verify:drivers-rls-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-drivers-rls-scope.mjs"]);
  },
};
