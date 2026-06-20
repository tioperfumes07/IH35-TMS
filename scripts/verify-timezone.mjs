#!/usr/bin/env node
// Guard — TIME & TIMEZONE law (docs/specs/TIME-AND-TIMEZONE.md, LOCKED). Day-boundary / HOS-bucketing math must use
// IANA zones (Luxon), DST-aware, anchored to the home terminal — NEVER fixed offsets or naive 24h day arithmetic.
// A Central day is 23h or 25h on DST-change dates; fixed-24h stepping + a hardcoded 1440 cap silently mis-bucket.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => { console.error(`FAIL verify-timezone: ${m}`); process.exit(1); };

// 1) HOS 8-day breakdown buckets by HOME-TERMINAL CALENDAR DAYS via Luxon (DST-aware), not fixed 24h steps.
const tracker = read("apps/backend/src/telematics/hos-tracker.service.ts");
if (!/import \{ DateTime \} from "luxon"/.test(tracker))
  fail("hos-tracker must use Luxon (DateTime) for home-terminal day-boundary math");
if (!/DateTime\.fromISO\(dateStr, \{ zone: HOME_TZ \}\)\.startOf\("day"\)/.test(tracker))
  fail("home-terminal day windows must use Luxon startOf('day') in HOME_TZ (IANA), not a fixed offset");
if (!/selDay\.minus\(\{ days: i \}\)/.test(tracker))
  fail("the 8-day breakdown must step by Luxon calendar days (selDay.minus({days})), DST-aware");
if (/dayEnd\.getTime\(\) - i \* 24/.test(tracker))
  fail("breakdown must NOT step days by fixed 24h arithmetic (mis-buckets on 23h/25h DST days)");
if (!/onDuty > dayLenMin/.test(tracker))
  fail("the per-day sanity cap must use the ACTUAL Luxon day length (dayLenMin: 1380/1440/1500), not a hardcoded 1440");
if (/some\(\(d\) => d\.on_duty_min > 1440\)/.test(tracker))
  fail("the hardcoded >1440 day cap is DST-wrong (a 25h day allows 1500) — use the per-day length");

// 2) Ban fixed-offset / naive-tz anti-patterns in the HOS/telematics day-math paths.
for (const f of [
  "apps/backend/src/telematics/hos-tracker.service.ts",
  "apps/backend/src/telematics/fleet-location-hos.service.ts",
]) {
  const src = read(f);
  if (/getTimezoneOffset\(/.test(src)) fail(`${f}: getTimezoneOffset() is forbidden — use IANA zones via Luxon`);
  if (/["'][-+]0[56]:00["']/.test(src)) fail(`${f}: hardcoded UTC offset literal ("-06:00"/"-05:00") forbidden — use America/Chicago`);
}

// 3) The spec exists, mandates Luxon + America/Chicago, and records the G1 (Central=UTC-5) supersede.
const spec = read("docs/specs/TIME-AND-TIMEZONE.md");
if (!/SUPERSEDES rule G1/.test(spec)) fail("TIME-AND-TIMEZONE.md must record the G1 'Central = UTC-5' supersede (fixed offset is wrong)");
if (!/America\/Chicago/.test(spec) || !/Luxon/.test(spec)) fail("spec must mandate Luxon + America/Chicago (IANA, DST-aware)");

console.log("OK verify-timezone: HOS day-boundary math uses Luxon home-terminal calendar days (DST-aware); no fixed offsets.");
