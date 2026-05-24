export default {
  name: "ensure-database-url",
  run: async (ctx) => {
    ctx.ensureDatabaseUrl();
  },
};
