export default {
  name: "verify:bookload-stop-boolean-coercion",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bookload-stop-boolean-coercion.mjs"]);
  },
};
