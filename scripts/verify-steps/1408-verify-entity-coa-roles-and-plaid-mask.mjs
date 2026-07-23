/** Cursor lane 1408 — entity-aware CoA validate + Plaid WF last-4 ownership. */
export default {
  name: "verify-entity-coa-roles-and-plaid-mask",
  run(ctx) {
    ctx.run("node", ["scripts/verify-entity-coa-roles-and-plaid-mask.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-entity-coa-roles-and-plaid-mask.mjs"]);
  },
};
