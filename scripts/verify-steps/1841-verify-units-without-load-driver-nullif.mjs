// 1841-verify-units-without-load-driver-nullif — Dispatch Unassigned Units panel.
// CONCAT_WS returns '' (never NULL) when all name parts are NULL, so `driver_name ?? "—"` let the empty
// string through and the panel rendered "T171 · · Need load". Asserts the NULLIF wrapper stays.
export default {
  name: "verify-units-without-load-driver-nullif",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-units-without-load-driver-nullif.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-units-without-load-driver-nullif.mjs"]);
  },
};
