export default {
  name: "verify:verify-relay-deposit-csv-upload-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-deposit-csv-upload-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-relay-deposit-csv-upload-wired.mjs"]);
  },
};
