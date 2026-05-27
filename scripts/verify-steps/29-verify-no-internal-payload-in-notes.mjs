export default {
  name: "verify-no-internal-payload-in-notes",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:no-internal-payload-in-notes"]) !== 0) {
      process.exit(1);
    }
  },
};
