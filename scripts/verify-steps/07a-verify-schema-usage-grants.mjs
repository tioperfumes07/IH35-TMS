export default {
  name: "verify-schema-usage-grants",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:schema-usage-grants"]) !== 0) {
      process.exit(1);
    }
  },
};
