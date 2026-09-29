// ROUND 219 ADDENDUM (owner, 2026-09-28): cancelling a load with zero settlement_lines must
// release its forward presettlement_link_id pointer (confirmed live regression: load 13623).
export default {
  name: "verify:cancel-releases-presettlement-link",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cancel-releases-presettlement-link.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-cancel-releases-presettlement-link.mjs"]);
  },
};
