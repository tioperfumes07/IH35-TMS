export default {
  name: "verify:driver-import-modal-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-import-modal-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-import-modal-uses-paritytable.mjs"]);
  },
};
