export default {
  name: "verify-advance-recovery-load-id",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:advance-recovery-load-id"]) !== 0) {
      process.exit(1);
    }
  },
};
