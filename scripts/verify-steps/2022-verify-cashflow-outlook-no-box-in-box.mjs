// Cash Flow 7-Day Outlook — flat section chrome, no nested tiles (verify-step 2022, Cursor EVEN band).
export default {
  name: "cashflow-outlook-no-box-in-box",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-cashflow-outlook-no-box-in-box.mjs"]);
  },
};
