export default {
  name: "verify-codex-vertical-nonmoney-zero-remainder",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reg049-unit-maintenance-history.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-reg049-unit-maintenance-history.mjs"]);
    await ctx.run("node", ["scripts/verify-reg050-work-orders-module-home.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-reg050-work-orders-module-home.mjs"]);
    await ctx.run("node", ["scripts/verify-reg048-work-order-v5-unit-contract.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-reg048-work-order-v5-unit-contract.mjs"]);
    await ctx.run("node", ["scripts/verify-codex-vertical-nonmoney-zero-remainder.mjs"]);
    await ctx.run("node", ["scripts/verify-maintenance-design-law.mjs"]);
    await ctx.run("node", ["scripts/verify-fleet-table-header-design-contract.mjs"]);
    await ctx.run("node", ["scripts/verify-wo-edit-comboboxes.mjs"]);
    await ctx.run("node", ["scripts/verify-auto-geofence-no-blocking-call.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-auto-geofence-no-blocking-call.mjs"]);
    await ctx.run("node", ["scripts/verify-active-entity-hardline.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-active-entity-hardline.mjs"]);
    await ctx.run("node", ["scripts/verify-samsara-external-ids-standard.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-samsara-external-ids-standard.mjs"]);
    await ctx.run("node", ["scripts/verify-samsara-real-driven-miles-per-leg.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-samsara-real-driven-miles-per-leg.mjs"]);
    await ctx.run("node", ["scripts/verify-real-driven-miles-segments.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-real-driven-miles-segments.mjs"]);
    await ctx.run("node", ["scripts/verify-samsara-routes-integration.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-samsara-routes-integration.mjs"]);
    await ctx.run("node", ["scripts/verify-samsara-driver-mirror-complete.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-samsara-driver-mirror-complete.mjs"]);
    await ctx.run("node", ["scripts/verify-stops-geocoded.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-stops-geocoded.mjs"]);
    await ctx.run("node", ["scripts/verify-yard-location-and-fence.mjs", "--selftest"]);
    // 443.101: the yard guard reads the live yard (0 on a fresh CI DB, PASS on prod read-only) — its live half runs in the
    // live-DB job (ci.yml required-live-load-guard, LEAD 443.99 class A ruling); its offline --selftest stays here.
    await ctx.run("node", ["scripts/verify-geofence-events-from-positions.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-geofence-events-from-positions.mjs"]);
  },
};
