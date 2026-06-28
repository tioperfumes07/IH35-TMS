export default {
  name: "verify-schema-parity",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:schema-parity"]) !== 0) {
      process.exit(1);
    }
  },
};
