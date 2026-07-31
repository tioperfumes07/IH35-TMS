// 1837-verify-pm-countdown-requests-not-due — Maintenance PM Countdown.
//
// /api/v1/maint/pm/due returns only is_due rows unless include_not_due is passed. A COUNTDOWN needs
// the not-yet-due ones, so without the flag the cards render "No active schedule" for schedules that
// exist and are active — telling operators to create duplicates on a DOT-relevant surface.
//
// Numbering: the Claude odd band 1600-1699 is fully allocated (every odd slot taken; only even
// numbers remain there and those are Cursor's lane), so this takes the next free ODD number above the
// global max rather than colliding.
export default {
  name: "verify-pm-countdown-requests-not-due",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-pm-countdown-requests-not-due.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-pm-countdown-requests-not-due.mjs"]);
  },
};
