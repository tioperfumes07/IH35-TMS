// Step 1741 — a raw status enum must never be a display-string fallback. Prod showed "OutOfService"
// on 13 dispatch cards beneath a label already reading "Out of service".
export default {
  name: "verify:no-raw-status-enum-in-ui",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-raw-status-enum-in-ui.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-raw-status-enum-in-ui.mjs"]);
  },
};
