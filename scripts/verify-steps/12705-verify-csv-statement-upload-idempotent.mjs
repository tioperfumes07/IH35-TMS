export default {
  name: "verify:csv-statement-upload-idempotent",
  run(ctx) {
    ctx.run("node", ["scripts/verify-csv-statement-upload-idempotent.mjs"]);
  },
};
