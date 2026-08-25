export default {
  name: "verify-cashflow-seven-day-strip-sql-balanced",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-cashflow-seven-day-strip-sql-balanced.mjs"]) !== 0) {
      throw new Error("verify-cashflow-seven-day-strip-sql-balanced failed");
    }
  },
};
