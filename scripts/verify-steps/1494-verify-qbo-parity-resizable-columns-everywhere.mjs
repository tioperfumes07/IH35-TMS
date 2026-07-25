export default {
  name: "verify:qbo-parity-resizable-columns-everywhere",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-parity-resizable-columns-everywhere.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-qbo-parity-resizable-columns-everywhere.mjs"]);
  },
};
