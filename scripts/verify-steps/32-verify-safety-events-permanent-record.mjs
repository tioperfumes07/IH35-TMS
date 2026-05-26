export default {
  name: "verify-safety-events-permanent-record",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:safety-events-permanent-record"]) !== 0) {
      process.exit(1);
    }
  },
};
