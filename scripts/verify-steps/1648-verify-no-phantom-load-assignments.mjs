/** DISP-PHANTOM-CLASS — deny mdata.load_assignments / loads.uuid / loads.delivered_at / loads.completed_at. */
export default {
  name: "verify-no-phantom-load-assignments",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-phantom-load-assignments.mjs"]);
    await ctx.run("node", ["scripts/verify-no-phantom-load-assignments.mjs", "--selftest"]);
  },
};
