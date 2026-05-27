export default {
  name: "verify-posting-uses-skip-locked",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:posting-uses-skip-locked"]) !== 0) {
      process.exit(1);
    }
  },
};
