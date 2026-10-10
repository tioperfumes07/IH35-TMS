/**
 * ROUND E23 — wires scripts/verify-purge-era-closures-still-hold.mjs (the guard that
 * re-asserts purge-era closures against live state every run) into CI. Live guard — requires
 * DATABASE_URL; runs in the live verify-step band.
 */
export default {
  name: "verify-purge-era-closures-still-hold",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-purge-era-closures-still-hold.mjs"]);
    // ROUND 443.9 — no USMCA row may point at a purged load / invoice / settlement / driver bill / fuel transaction.
    await ctx.run("node", ["scripts/verify-no-orphan-of-purged-documents.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-orphan-of-purged-documents.mjs"]);
  },
};
