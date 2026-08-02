// SAF-INC-LIFECYCLE — Damage / Trailer Interchange detail edit path (verify-step 2036, Cursor EVEN band).
export default {
  name: "safety-inc-lifecycle-edit-reachable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-inc-lifecycle-edit-reachable.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-safety-inc-lifecycle-edit-reachable.mjs"]);
  },
};
