export default {
  name: "verify:app-pool-role-fail-closed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-app-pool-role-fail-closed.mjs"]);
  },
};
