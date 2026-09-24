/**
 * ROUND 142.1 — wires scripts/verify-no-audit-event-without-its-journal-entry.mjs into CI.
 * Live guard — requires DATABASE_URL for audit_events + journal_entries live check.
 */
export default {
  name: "verify-no-audit-event-without-its-journal-entry",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-audit-event-without-its-journal-entry.mjs"]);
  },
};
