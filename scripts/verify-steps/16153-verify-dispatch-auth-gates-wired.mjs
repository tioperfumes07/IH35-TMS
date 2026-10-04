export default {
  name: "verify:dispatch-auth-gates-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-auth-gates-wired.mjs"]);
  },
};
