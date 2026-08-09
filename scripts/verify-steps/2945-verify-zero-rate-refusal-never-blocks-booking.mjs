export default {
  name: "verify:zero-rate-refusal-never-blocks-booking",
  run(ctx) {
    ctx.run("node", ["scripts/verify-zero-rate-refusal-never-blocks-booking.mjs"]);
  },
};
