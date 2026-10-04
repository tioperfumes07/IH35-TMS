// Lead ROUND 394 §3 (2026-10-04): the settlement fuel feed wrote "ustFluid" — a slice of "Diesel Exhaust Fluid" — as the
// receipt reference on four DEF rows. The reference is the printed receipt number or NULL, never free text.
export default {
  name: "verify:fuel-feed-reference-never-free-text",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-feed-reference-never-free-text.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-fuel-feed-reference-never-free-text.mjs"]);
  },
};
