export default {
  name: "verify-sql-write-targets",
  run: async (ctx) => {
    // Runs against the from-migrations DB (db-reset, step 2) via DATABASE_URL; ratchets on NEW phantom writes.
    if (ctx.run("npm", ["run", "verify:sql-write-targets"]) !== 0) {
      process.exit(1);
    }
  },
};
