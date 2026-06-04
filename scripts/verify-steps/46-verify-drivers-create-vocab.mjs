export default {
  name: "verify-drivers-create-vocab",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:drivers-create-vocab"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
