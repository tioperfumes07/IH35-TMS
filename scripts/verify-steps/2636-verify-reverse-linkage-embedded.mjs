// verify-reverse-linkage-embedded — LINKAGE LAW §10 + §7 module-header law. Forward drill-through is
// the half everyone builds; the reverse half rots, and you land on a detail page from a search result
// or a pasted link with no route back. Marker CONTRACT, not a keyword scan: backHref / breadcrumb /
// a *-reverse-drill testid / an EntityLink back to the owner all count. Baseline ratchet (10 known).
export default {
  name: "verify:reverse-linkage-embedded",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reverse-linkage-embedded.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-reverse-linkage-embedded.mjs"]);
  },
};
