export default {
  name: "verify-safety-accidents-wire-up",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:safety-accidents-wire-up"]) !== 0) {
      process.exit(1);
    }
  },
};
