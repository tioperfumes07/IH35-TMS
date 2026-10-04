export default {
  name: "verify:bookload-section-b-hos",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bookload-section-b-hos.mjs"]);
  },
};
