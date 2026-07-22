/**
 * Step 1221 — verify-linkage-required-edges.
 * Enforces CLAUDE.md §10a/§10d: one economic fact must be wired through every module and account
 * it touches (claim -> lawsuit -> expense -> driver -> unit -> GL -> payment), forward AND reverse.
 * Layer 2 of the linkage law; layer 1 is verify-no-dead-schema (step 1220).
 */
export default {
  name: "verify:linkage-required-edges",
  run(ctx) {
    ctx.run("node", ["scripts/verify-linkage-required-edges.mjs"]);
  },
};
