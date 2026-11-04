export default {
  name: "verify:verify-live-fails-225-229-233-241",
  run(ctx) {
    ctx.run("node", ["scripts/verify-live-fails-225-229-233-241.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-live-fails-225-229-233-241.mjs"]);
  },
};
