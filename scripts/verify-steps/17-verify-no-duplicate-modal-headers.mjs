export default {
  name: "verify-no-duplicate-modal-headers",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:no-duplicate-modal-headers"]) !== 0) {
      process.exit(1);
    }
  },
};
