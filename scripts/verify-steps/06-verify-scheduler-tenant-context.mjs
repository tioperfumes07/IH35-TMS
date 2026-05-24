export default {
  name: "verify-scheduler-tenant-context",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:scheduler-tenant-context"]) !== 0) {
      process.exit(1);
    }
  },
};
