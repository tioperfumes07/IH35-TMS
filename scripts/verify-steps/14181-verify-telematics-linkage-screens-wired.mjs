export default {
  name: "verify:telematics-linkage-screens-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-telematics-linkage-screens-wired.mjs"]);
  },
};
