// 2064-verify-saf-orph04-form2290-per-unit-deadline — SAF-ORPH-04 closure (Cursor EVEN band).
//
// IRS Form 2290: due the last day of the month FOLLOWING first use, business-day shifted — per vehicle,
// not company-wide Aug 31. Steps 1500 (date math) and 1618 (backend wired) were green while the Safety
// Permits banner still showed only the annual date. This step asserts the deadline surfaces are honest.
const SCRIPT = "scripts/verify-saf-orph04-form2290-per-unit-deadline.mjs";
const F32 = "scripts/verify-saf-f32-permits-deadline-honesty.mjs";

export default {
  name: "verify:saf-orph04-form2290-per-unit-deadline",
  async run(ctx) {
    await ctx.run("node", [F32, "--selftest"]);
    await ctx.run("node", [F32]);
    await ctx.run("node", [SCRIPT, "--selftest"]);
    await ctx.run("node", [SCRIPT]);
  },
};
