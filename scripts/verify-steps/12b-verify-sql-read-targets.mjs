export default {
  name: "verify-sql-read-targets",
  run: async (ctx) => {
    // Runs against the from-migrations DB (db-reset, step 2) via DATABASE_URL; ratchets on NEW phantom reads.
    // Companion to 12a (writes). Catches SELECT/JOIN/WHERE columns that don't exist in the migrated schema.
    if (ctx.run("npm", ["run", "verify:sql-read-targets"]) !== 0) {
      process.exit(1);
    }
  },
};
