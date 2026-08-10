import { run } from "../../verify-dependabot-exempt-in-body-gates.mjs";

export default {
  name: "verify-dependabot-exempt-in-body-gates",
  async run(ctx) {
    const { ok, message } = run();
    if (!ok) {
      ctx.fail(message);
    } else {
      ctx.pass(message);
    }
  },
};
