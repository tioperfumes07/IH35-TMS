// LST-PICKER-02: the WO/Bill item picker must READ catalogs.items — the same canonical table the
// inline "+ Add new item" quick-create WRITES. It previously read the mdata.qbo_items mirror, so a
// created item was invisible in the picker that created it.
export default {
  name: "verify:item-picker-canonical-table",
  run(ctx) {
    ctx.run("node", ["scripts/verify-item-picker-canonical-table.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-item-picker-canonical-table.mjs"]);
  },
};
