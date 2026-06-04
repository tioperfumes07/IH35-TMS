export default {
  name: "verify-safety-meetings-training-wire",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:safety-meetings-training-wire"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
