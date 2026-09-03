/** CC-2 — Dispatch Load-board KPI drill-through (PASTE-ALL-SEATS-2026-09-03 Packet E).
 * The "Units available"/"Units needing return" tiles' only drill target is their own in-page
 * panel (no dedicated list route exists for fleet-bounded unit data) -- that panel must render
 * every counted row, never a PANEL_ROW_LIMIT-sliced preview. */
export default {
  name: "verify-dispatch-overview-units-kpi-full-drill",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-overview-units-kpi-full-drill.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispatch-overview-units-kpi-full-drill.mjs"]);
  },
};
