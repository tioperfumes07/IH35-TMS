// 1555-verify-canonical-load-nav — C5 (LINK: canonical load navigation everywhere).
//
// A load has one canonical address: /dispatch/loads/:id. EntityLink kind="load" already resolves
// to it and the route is already mounted — but the component mounted there is a redirect straight
// back to `/dispatch?load_id=`, so the canonical route is a FACADE and every drill-through still
// lands on a query-param board bookmark with a raw load UUID in the URL.
//
// Five channels: (A) query-string load navigation, (B) the facade — the component at
// /dispatch/loads/:id must not redirect back to ?load_id=, (C) the EntityLink resolver contract
// (path form, no `?`) so the facade can never be "fixed" by degrading the primitive to match it,
// (D) a column labelled Load / Load # must drill, (E) the reader — Dispatch.tsx must open the load
// from the ROUTE param, without which migrating the call sites would be purely cosmetic.
//
// Run against pre-fix origin/main this FAILS with 22 problems: 14 query-string load navigations
// across 13 files, the facade, the searchParams-only reader (2), and 5 dead "Load" columns.
//
// The --selftest runs FIRST and plants 24 defects (eight call-site shapes including the legacy
// `?load=`, a `?view=loads&load_id=` compound, a double-quoted URL, a resolveRowHref factory and a
// <Navigate>; a second map-viewport writer breaching the shrink-only budget; the facade with and
// without its ProtectedRoute wrapper; the route unmounted; four resolver mutations including the
// query-form degrade and a deleted `case "load"`; four dead-column shapes including an office
// surface escaping into the customer-portal route; two reader mutations; and three deleted files)
// plus classifier controls proving it does NOT claim /api/ request URLs, legacy searchParams READS
// (old bookmarks must keep working), commented-out JSX, another module's query drill, <select>
// options, .ts column data, an honestly-blank em-dash column, or the customer portal's own
// canonical /portal/loads/:id. Five meta-assertions prove each detector is not a constant, so the
// selftest is structurally CAPABLE of failing.
export default {
  name: "verify-canonical-load-nav",
  async run(ctx) {
    if ((await ctx.run("node", ["scripts/verify-canonical-load-nav.mjs", "--selftest"])) !== 0) return 1;
    return ctx.run("node", ["scripts/verify-canonical-load-nav.mjs"]);
  },
};
