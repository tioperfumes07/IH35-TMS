// ROUND 236 (Lead, P0) — AUTH-089's duplicate-expense-document cleanup voided real charges by
// keying "duplicate" identity on (load, amount) alone. Permanent backstop against recurrence.
export default {
  name: "verify:expense-dedupe-never-keys-on-load-and-amount",
  run(ctx) {
    ctx.run("node", ["scripts/verify-expense-dedupe-never-keys-on-load-and-amount.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-expense-dedupe-never-keys-on-load-and-amount.mjs"]);
  },
};
