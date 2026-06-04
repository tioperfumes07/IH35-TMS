export default {
  name: "verify-rls-uuid-cast-nullif",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:rls-uuid-cast-nullif"]) !== 0) {
      throw new Error("verify-rls-uuid-cast-nullif failed");
    }
  },
};
