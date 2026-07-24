/** Cursor lane — unused OO recoveries optional (owner 2026-07-23). */
export default {
  name: "verify-coa-optional-unused-recoveries",
  run(ctx) {
    ctx.run("node", ["scripts/verify-coa-optional-unused-recoveries.mjs"]);
  },
};
