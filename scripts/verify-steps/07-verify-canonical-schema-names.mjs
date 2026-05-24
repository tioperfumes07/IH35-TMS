export default {
  name: "verify-canonical-schema-names",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:canonical-schema-names"]) !== 0) {
      process.exit(1);
    }
  },
};
