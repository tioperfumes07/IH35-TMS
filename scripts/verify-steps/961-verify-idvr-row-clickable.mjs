export default {
  name: "verify:idvr-row-clickable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-idvr-row-clickable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-idvr-row-clickable.mjs"]);
  },
};
