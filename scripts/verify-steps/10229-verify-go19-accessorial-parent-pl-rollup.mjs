export default {
  name: "verify:go19-accessorial-parent-pl-rollup",
  run(ctx) {
    ctx.run("node", ["scripts/verify-go19-accessorial-parent-pl-rollup.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-go19-accessorial-parent-pl-rollup.mjs"]);
  },
};
