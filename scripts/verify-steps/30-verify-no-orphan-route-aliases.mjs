export default {
  name: "verify-no-orphan-route-aliases",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:no-orphan-route-aliases"]) !== 0) {
      process.exit(1);
    }
  },
};
