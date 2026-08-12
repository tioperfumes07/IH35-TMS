// verify-steps wrapper for scripts/verify-flag-keys-seeded.mjs (ACCT-F355, verify-step 3109).
//
// The guard itself lives as a standalone scripts/verify-flag-keys-seeded.mjs (not under
// verify-steps/) because it is DB-backed and useful to run directly/locally
// (node scripts/verify-flag-keys-seeded.mjs --selftest). This wrapper is what makes it FULLY WIRED
// per verify-guard-wired.mjs: ci.yml runs `npm run verify:pre-commit`, which imports every
// scripts/verify-steps/*.mjs file — this one spawns the real guard as a subprocess so it gets a
// real DATABASE_URL (the ephemeral verify Postgres) inside that context, same pattern as
// verify-steps/1213-verify-chain-04-bill-payment-bank-tieout.mjs wrapping
// scripts/verify-chain-04-bill-payment-bank-tieout.mjs.
export default {
  name: "verify-flag-keys-seeded",
  run(ctx) {
    ctx.run("node", ["scripts/verify-flag-keys-seeded.mjs"]);
  },
};
