export default {
  name: "verify:verify-ui4-d065-d068-d071-d076",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ui4-d065-d068-d071-d076.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ui4-d065-d068-d071-d076.mjs"]);
  },
};
