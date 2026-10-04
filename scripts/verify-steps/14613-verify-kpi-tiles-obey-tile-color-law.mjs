// KPI-TILE-COLOR LAW (owner ruling 2026-09-04). Wired because the ruling went a month unenforced:
// the tokens existed, DrillKpiCard used them, and LedgerKpiPanel — every Banking and Factoring KPI —
// was still a white tile on a white page. A ruling that lives only in a token file is not enforced.
export default {
  name: "verify:kpi-tiles-obey-tile-color-law",
  run(ctx) {
    ctx.run("node", ["scripts/verify-kpi-tiles-obey-tile-color-law.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-kpi-tiles-obey-tile-color-law.mjs"]);
  },
};
