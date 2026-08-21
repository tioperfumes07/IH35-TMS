// verify-steps wrapper for scripts/verify-compliance-property-tax-add-line-chrome-law.mjs
// (WAVE 2 compliance item-8 chrome-law audit per INBOX-CC-3.md "NO LEFTOVERS" correction,
// continuing forward from home -> tasks -> driver-hub: PropertyTaxRenditionPage.tsx's asset-line
// button used the forbidden "+ Add" verb, relabeled to "+ Create Line"), verify-step 4189, Rule 37
// claim-then-author pattern (claim shipped in #13422). Static, no DB — same shape as sibling
// verify-steps/*.mjs files.
export default {
  name: "verify-compliance-property-tax-add-line-chrome-law",
  run(ctx) {
    ctx.run("node", ["scripts/verify-compliance-property-tax-add-line-chrome-law.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-compliance-property-tax-add-line-chrome-law.mjs"]);
  },
};
