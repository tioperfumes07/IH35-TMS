export default {
  name: "verify:csv-import-direction",
  run(ctx) {
    ctx.run("node", ["scripts/verify-csv-import-direction.mjs"]);
  },
};
