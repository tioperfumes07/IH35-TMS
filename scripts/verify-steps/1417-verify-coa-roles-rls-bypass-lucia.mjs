/** Cursor lane verify-step 1417 — CoA roles RLS policy accepts app.bypass_rls='lucia'. */
export default {
  name: "verify-coa-roles-rls-bypass-lucia",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-coa-roles-rls-bypass-lucia.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-coa-roles-rls-bypass-lucia.mjs"]);
  },
};
