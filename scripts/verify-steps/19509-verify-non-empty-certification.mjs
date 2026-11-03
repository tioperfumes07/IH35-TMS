export default {
  name: "verify:non-empty-certification",
  run(ctx) {
    ctx.run("node", ["scripts/verify-non-empty-certification.mjs"]);
  },
};
