// Register row 154 / D035 (Lead 443.301): every Active WOs column sorts. Claimed number 18733 (LEAD).
export default {
  name: "verify-maintenance-wo-table-all-sortable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-maintenance-wo-table-all-sortable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-maintenance-wo-table-all-sortable.mjs"]);
    await ctx.run("npx", ["vitest", "run", "--root", "apps/frontend", "src/pages/maintenance/components/WorkOrdersTable.sort.test.ts"]);
  },
};
