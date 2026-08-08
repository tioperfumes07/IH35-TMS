// verify-driver-list-cap-covers-roster — ACCT-F209 (board card FAIL-D1).
//
// The driver list defaulted to LIMIT 50 with ORDER BY created_at DESC, so it returned the 50 NEWEST
// drivers and silently dropped the rest. Measured on prod for USMCA: 89 listable rows, 50 returned,
// and of the 27 genuinely ACTIVE drivers only 17 fell inside the window — TEN REAL, ACTIVE DRIVERS
// WERE UNREACHABLE in the Book Load picker.
//
// Newest-first is what turned a pagination default into a blocker: the drivers hidden were the
// LONGEST-TENURED, the opposite of who a dispatcher usually wants. Combined with a search that could
// not match a full name (ACCT-F203), there was NO route to those drivers at all — not by scrolling,
// not by typing. The two defects covered for each other, which is why this guard and the F203 guard
// both have to hold.
//
// The guard asserts the PROPERTY that made drivers unreachable — a default page smaller than a real
// roster — rather than pinning one magic number that would simply be edited to whatever the code said
// the day it failed. It also FAILS CLOSED if the schema moves and it cannot parse the bound: a guard
// that cannot see must not report OK.
export default {
  name: "verify:driver-list-cap-covers-roster",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-list-cap-covers-roster.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-driver-list-cap-covers-roster.mjs"]);
  },
};
