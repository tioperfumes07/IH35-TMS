/** CC-2 — GET /api/v1/accounting/load-costs-board live-confirmed HTTP 500 fix. mdata.loads has no
 * trailer_id column and mdata.units has no operating_company_id column; both were reintroduced by
 * the Load Costs Board's newly-shipped SQL. Fixed to the same pattern loads.routes.ts already
 * uses (dispatch.load_assignment_history.new_trailer_id + owner/leased COALESCE). */
export default {
  name: "verify-load-costs-board-trailer-unit-columns",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-costs-board-trailer-unit-columns.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-load-costs-board-trailer-unit-columns.mjs"]);
  },
};
