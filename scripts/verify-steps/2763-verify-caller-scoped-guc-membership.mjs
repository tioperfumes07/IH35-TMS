// CLS-GUC-CALLER-SCOPED ratchet. A route may not SET app.operating_company_id to a company the CALLER
// named without first proving the caller belongs to it — RLS then enforces whatever the attacker asked
// for, and under PERMANENT LAW 4 an accessible-companies predicate is NOT a membership check because
// org.user_accessible_company_ids() returns every active company for an Owner session.
//
// Number 2763 was claimed in CLAIMED-NUMBERS.json when the guard was written, but the step file was
// never created — so the guard sat registered as type='enforced' in docs/law/LAW.json while running in
// no pipeline at all. verify-law-registry is existence-only over the GUARD file, so it stayed green and
// could not see the gap. That is the "LAW = ENFORCED GUARD, OR IT IS NOT LAW" failure mode in its
// quietest form: a law that is registered, documented, and unenforced.
//
// The selftest runs FIRST and is the proof the check CAN go red: 8 cases including assert-after-GUC
// (too late), and an assert laundered in from a DIFFERENT route in the same file.
export default {
  name: "verify-caller-scoped-guc-membership",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-caller-scoped-guc-membership.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-caller-scoped-guc-membership.mjs"]);
  },
};
