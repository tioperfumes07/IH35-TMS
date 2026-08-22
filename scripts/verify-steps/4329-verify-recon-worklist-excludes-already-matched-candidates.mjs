export default {
  name: "verify:recon-worklist-excludes-already-matched-candidates",
  run(ctx) {
    ctx.run("node", ["scripts/verify-recon-worklist-excludes-already-matched-candidates.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-recon-worklist-excludes-already-matched-candidates.mjs"]);
  },
};
