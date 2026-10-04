export default {
  name: "verify:settlement-creator-ties-document",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-creator-ties-document.mjs"]);
  },
};
