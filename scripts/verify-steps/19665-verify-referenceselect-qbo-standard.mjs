export default {
  name: "verify:referenceselect-qbo-standard",
  run(ctx) {
    ctx.run("node", ["scripts/verify-referenceselect-qbo-standard.mjs"]);
  },
};
