export default {
  name: "verify-no-demo-rows-in-safety",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:no-demo-rows-in-safety"]) !== 0) {
      process.exit(1);
    }
  },
};
