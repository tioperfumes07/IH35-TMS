/** GO-23 NAV-DROPDOWN-CLIP GUARD — every leaf href in ACCOUNTING_SUB_NAV_ITEMS must be reachable
 * by an actual click, not just declared in the manifest (owner FINISH-LAW report 2026-09-03: "Load
 * costs" unreachable except by typing the URL). Root cause: `.hover-dropdown-nav`'s `overflow-x:
 * auto` forces `overflow-y` to also compute `auto` (CSS Overflow spec), clipping the absolutely
 * positioned `.nav-dropdown` menu -- one bug, confirmed live on all six Accounting groups (Bills /
 * Expenses / Bill payment / Invoices / Maintenance & shop / More), zero console errors. Fixed by
 * portal-rendering the menu into document.body (PR TBD, ported from components/Combobox.tsx's
 * measureListboxStyle pattern). */
export default {
  name: "verify-accounting-subnav-click-reachability",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-accounting-subnav-click-reachability.mjs"]);
  },
};
