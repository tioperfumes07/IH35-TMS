/** Cursor lane verify-step 1401 — CoA Roles account picker entity-scoped + postable. */
export default {
  name: "verify-coa-roles-accounts-picker-entity-scoped",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-coa-roles-accounts-picker-entity-scoped.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-coa-roles-accounts-picker-entity-scoped.mjs"]);
  },
};
