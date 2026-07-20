export default {
  name: "verify:lane-detail-modal-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lane-detail-modal-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-lane-detail-modal-uses-paritytable.mjs"]);
  },
};
