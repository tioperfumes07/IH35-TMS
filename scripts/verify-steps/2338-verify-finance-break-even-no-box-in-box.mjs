// CLS-BOX-IN-BOX — Finance Break-Even page flatten (verify-step 2338 · Cursor EVEN band).
export default {
  name: "finance-break-even-no-box-in-box",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-finance-break-even-no-box-in-box.mjs"]);
  },
};
