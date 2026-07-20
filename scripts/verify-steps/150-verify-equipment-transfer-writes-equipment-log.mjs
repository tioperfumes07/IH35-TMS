// 0242 / biz-flow-8 — transfer completion writes mdata.equipment_log (Rule 17: steps only).
export default {
  name: "equipment-transfer-writes-equipment-log",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-equipment-transfer-writes-equipment-log.mjs"]);
  },
};
