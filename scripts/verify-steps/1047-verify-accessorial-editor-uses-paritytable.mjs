export default {
  name: "verify:accessorial-editor-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accessorial-editor-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-accessorial-editor-uses-paritytable.mjs"]);
  },
};
