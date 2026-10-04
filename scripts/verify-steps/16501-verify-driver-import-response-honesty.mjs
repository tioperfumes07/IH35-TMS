export default {
  name: "verify:driver-import-response-honesty",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-import-response-honesty.mjs"]);
  },
};
