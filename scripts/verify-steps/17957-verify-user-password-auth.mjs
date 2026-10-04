export default {
  name: "verify:user-password-auth",
  run(ctx) {
    ctx.run("node", ["scripts/verify-user-password-auth.mjs"]);
  },
};
