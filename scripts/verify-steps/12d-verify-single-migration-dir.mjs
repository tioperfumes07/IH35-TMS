export default {
  name: "verify-single-migration-dir",
  run: async (ctx) => {
    // Static: no migration files outside the canonical db/migrations/ (ratchet on the 11 known orphans).
    if (ctx.run("npm", ["run", "verify:single-migration-dir"]) !== 0) process.exit(1);
  },
};
