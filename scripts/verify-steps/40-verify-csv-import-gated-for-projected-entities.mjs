export default {
  name: "verify-csv-import-gated-for-projected-entities",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:csv-import-gated-for-projected-entities"]) !== 0) {
      process.exit(1);
    }
  },
};
