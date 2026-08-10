import { run } from "../../verify-usmca-active-not-hidden-skills.mjs";

export default {
  name: "verify-usmca-active-not-hidden-skills",
  async run(ctx) {
    const { ok, message } = run();
    if (!ok) {
      ctx.fail(message);
    } else {
      ctx.pass(message);
    }
  },
};
