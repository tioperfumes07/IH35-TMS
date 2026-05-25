export default {
  name: "verify-no-boot-throwing-env-checks",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:no-boot-throwing-env-checks"]) !== 0) {
      process.exit(1);
    }
  },
};
