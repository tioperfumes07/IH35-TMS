export default {
  name: "verify-banking-controls-boxed-and-tokenized",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-controls-boxed-and-tokenized.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-banking-controls-boxed-and-tokenized.mjs"]);
  },
};
