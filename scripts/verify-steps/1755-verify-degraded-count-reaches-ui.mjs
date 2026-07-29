// Step 1755 — a DEGRADED (partial) lists count must reach the badge. The backend has reported it
// since LST-COUNT-01; the signal died at the client and a partial total rendered as a complete one.
export default {
  name: "verify:degraded-count-reaches-ui",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-degraded-count-reaches-ui.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-degraded-count-reaches-ui.mjs"]);
  },
};
