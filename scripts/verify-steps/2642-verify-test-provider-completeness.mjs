// verify-test-provider-completeness — CLS-TEST-PROVIDER-DRIFT. A component that quietly ADOPTS a hook
// (useQuery, <Link>) makes its test's render THROW, killing every case in the file at once — a P0
// regression test can go dead while the suite still looks covered. That happened twice in one day
// (#4475 Router, #4495 QueryClient). Baseline ratchet: 22 known, NEW ones fail, list may only shrink.
export default {
  name: "verify:test-provider-completeness",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-test-provider-completeness.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-test-provider-completeness.mjs"]);
  },
};
