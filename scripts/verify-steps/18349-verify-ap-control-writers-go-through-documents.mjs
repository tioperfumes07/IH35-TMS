export default {
  name: "verify:ap-control-writers-go-through-documents",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ap-control-writers-go-through-documents.mjs"]);
  },
};
