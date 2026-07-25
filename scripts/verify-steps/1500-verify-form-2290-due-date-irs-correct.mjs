// 1500-verify-form-2290-due-date-irs-correct — SAF-F32. The HVUT due date is a REGULATORY value.
//
// Rule 15: a filing deadline shown to an operator is relied on to avoid an IRS penalty. It must be
// computed, never guessed, and never invented by the UI.
//
// WHY A NEW STEP RATHER THAN A FIX TO THE OLD SCRIPT: scripts/verify-form-2290-deadlines-current.mjs
// exists but is wired ONLY through package.json. The runner enumerates scripts/verify-steps/*.mjs, so
// that script HAS NEVER EXECUTED in this pipeline — and it asserted only that a migration and two
// route strings exist, never a single date. Meanwhile the deadline was hardcoded
// Date.UTC(year, 7, 31) for every vehicle and the UI rendered a hardcoded August-31 literal whenever
// the endpoint had not answered.
//
// THE IRS RULE: Form 2290 is due the LAST DAY OF THE MONTH FOLLOWING the month of first use during
// the tax period (July 1 – June 30). Aug 31 is correct only for a July first use; a vehicle first
// used in November is due December 31. If that date is a Saturday, Sunday or legal holiday, the next
// business day is timely.
//
// The assertions live in scripts/verify-form-2290-due-date-irs.mts and are spawned through tsx,
// because this runner executes plain `node`, which cannot import a TypeScript module. That split is
// deliberate: the alternative was to regress the check to a grep, and a grep cannot tell a correct
// date calculation from a hardcoded one. These call the real functions on real dates, so a
// reimplementation that keeps the names and returns Aug 31 for everything still fails.
import path from "node:path";

export default {
  name: "verify:form-2290-due-date-irs-correct",
  run(ctx) {
    const script = path.join(ctx.ROOT, "scripts/verify-form-2290-due-date-irs.mts");
    if (ctx.run("npx", ["tsx", script], { cwd: ctx.ROOT }) !== 0) {
      process.exit(1);
    }
  },
};
