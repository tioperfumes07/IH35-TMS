export default {
  name: "verify:driver-termination-company-date-compile",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-termination-company-date-compile.mjs"]);
  },
};
