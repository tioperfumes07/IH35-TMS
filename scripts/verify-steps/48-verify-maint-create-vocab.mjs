export default {
  name: "verify-maint-create-vocab",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:maint-create-vocab"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
