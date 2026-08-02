// Insurance landing — shrink-safe grid at 1440px (verify-step 2018, Cursor EVEN band).
export default {
  name: "insurance-landing-no-overflow",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-insurance-landing-no-overflow.mjs"]);
  },
};
