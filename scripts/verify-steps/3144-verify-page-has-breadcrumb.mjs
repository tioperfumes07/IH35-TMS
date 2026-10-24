/**
 * CLAIMED 3144 — Cursor EVEN — verify-page-has-breadcrumb (443.325 ENG-31)
 * SURFACE-BREACH-AUTHORIZED: CC-1 LEAD 443.325 ENG-31 guard paths (3144 unclaimed on main at author time).
 */
export default {
  name: "verify-page-has-breadcrumb",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-page-has-breadcrumb.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-page-has-breadcrumb.mjs"]);
  },
};
