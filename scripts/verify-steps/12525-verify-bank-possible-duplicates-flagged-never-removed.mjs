export default {
  name: "verify:bank-possible-duplicates-flagged-never-removed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-possible-duplicates-flagged-never-removed.mjs"]);
  },
};
