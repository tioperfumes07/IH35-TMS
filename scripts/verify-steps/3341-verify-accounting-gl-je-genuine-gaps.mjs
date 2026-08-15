// LINK-F5186 — gl_je Required-column honesty audit, accounting genuine-gap builds (verify-step
// 3341 — CC-1 band, claimed in commit CLAIM-RESERVE verify-step 3341, landed on main as a1b5eceb).
export default {
  name: "accounting-gl-je-genuine-gaps",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-gl-je-genuine-gaps.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-accounting-gl-je-genuine-gaps.mjs"]);
  },
};
