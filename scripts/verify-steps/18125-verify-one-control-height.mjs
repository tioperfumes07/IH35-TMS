export default {
  name: "verify:one-control-height",
  run(ctx) {
    // OWNER DESIGN LAW 2026-10-02 rule 2, re-reported 2026-10-04: "ALL BOXES, DATES, FILTERS ETC MUST
    // BE UNIFORM FOLLOWING STANDARD DESIGN HEIGHTS ETC." Every shared filter control's TRIGGER must
    // declare its height from one source, never from vertical padding.
    ctx.run("node", ["scripts/verify-one-control-height.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-one-control-height.mjs"]);
  },
};
