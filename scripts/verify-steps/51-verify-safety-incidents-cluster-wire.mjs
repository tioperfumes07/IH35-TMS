export default {
  name: "verify-safety-incidents-cluster-wire",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:safety-incidents-cluster-wire"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
