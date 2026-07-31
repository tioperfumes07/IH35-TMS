// 1618-verify-form-2290-per-unit-deadline-wired — SAF-ORPH-04.
//
// form2290DueDateForFirstUse() was correct and fully unit-tested (step 1500 green) and had NO caller.
// A correctness guard proves the function returns the right date when invoked; it says nothing about
// whether anything invokes it. This step asserts the per-unit due date is actually reachable in the
// product, so a truck first used in October surfaces as due Nov 30 instead of vanishing behind the
// company-wide Aug 31 banner.
export default {
  name: "verify-form-2290-per-unit-deadline-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-form-2290-per-unit-deadline-wired.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-form-2290-per-unit-deadline-wired.mjs"]);
  },
};
