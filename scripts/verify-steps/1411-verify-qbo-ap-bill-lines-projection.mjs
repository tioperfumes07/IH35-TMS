/** Cursor lane — QBO A/P bill Line[] → accounting.bill_lines projection. */
export default {
  name: "verify-qbo-ap-bill-lines-projection",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-ap-bill-lines-projection.mjs"]);
  },
};
