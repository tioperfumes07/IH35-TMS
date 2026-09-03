/** GO-21 B5 — driver_pay_rate_override_reason must stay wired end to end (CREATE schema ->
 * INSERT/UPDATE -> in-memory load patch -> frontend send), or a typed per-load override rate is
 * silently discarded again (mdata.loads.driver_pay_rate_override_reason, migration 202613460001;
 * fixed live 2026-09-03, PR #20018). */
export default {
  name: "verify-driver-pay-rate-override-reason-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-pay-rate-override-reason-wired.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-driver-pay-rate-override-reason-wired.mjs"]);
  },
};
