export default {
  name: "verify-maint-tire-program",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:maint-tire-program"]) !== 0) {
      throw new Error("verify:maint-tire-program failed");
    }
  },
};
