// ROUND 390.2 (CC-1): verify-arriving-soon-serves-pm-and-wo-due was an ORPHAN (never executed by CI) and is now wired.
// Static: Arriving-Soon's PM due comes from maintenance.pm_schedules excluding sample/test units — inline, or through the
// E-15 PM engine (computePmDueEngineForCompany) whose own query joins pm_schedules and excludes sample units; the
// open-WO join and the card fields stay.
export default {
  name: "verify-arriving-soon-serves-pm-and-wo-due",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-arriving-soon-serves-pm-and-wo-due.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-arriving-soon-serves-pm-and-wo-due.mjs"]);
  },
};
