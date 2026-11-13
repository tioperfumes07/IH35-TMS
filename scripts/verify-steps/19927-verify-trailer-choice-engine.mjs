// CC-2 ENG-13 — trailer choice engine: 0 active loads missing trailer
// (load_trailer_equipment_id or non_owned_trailer_id must be non-NULL).
export default {
  name: "verify:verify-trailer-choice-engine",
  run(ctx) {
    ctx.run("node", ["scripts/verify-trailer-choice-engine.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-trailer-choice-engine.mjs"]);
  },
};
