/**
 * ROUND E23 — wires scripts/verify-relay-deposits-sync-is-scheduled.mjs (guard 47, the
 * self-arming population check for relay deposit cron) into CI. Live guard — requires
 * DATABASE_URL; runs in the live verify-step band.
 */
export default {
  name: "verify-relay-deposits-sync-is-scheduled",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-relay-deposits-sync-is-scheduled.mjs"]);
  },
};
