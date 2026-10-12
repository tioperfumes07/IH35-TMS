import { run } from "../verify-usmca-active-not-hidden-skills.mjs";

export default {
  name: "verify-usmca-active-not-hidden-skills",
  async run(ctx) {
    const { ok, message } = run();
    if (!ok) {
      ctx.fail(message);
    } else {
      // _context.mjs exposes no ctx.pass (443.99): a step reports success by logging and returning.
      console.log(message);
    }
  },
};
