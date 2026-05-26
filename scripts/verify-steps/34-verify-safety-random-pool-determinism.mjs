export default {
  name: "verify-safety-random-pool-determinism",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:safety-random-pool-determinism"]) !== 0) {
      process.exit(1);
    }
  },
};
