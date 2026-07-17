export default {
  name: "verify-sql-column-existence",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-sql-column-existence.mjs"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
