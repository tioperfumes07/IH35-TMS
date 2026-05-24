export default {
  name: "verify-arch-design",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:arch-design"]) !== 0) {
      process.exit(1);
    }
  },
};
