/**
 * GAP-49 — Major defect catalog (locked per 49 CFR §396.11).
 *
 * A defect whose code appears here renders the vehicle UNSAFE to operate and
 * therefore BLOCKS dispatch (WF-050).  Any DVIR defect that does not match a
 * major code defaults to "minor" (note for next service) unless the driver or a
 * manager explicitly tags it as an "observation".
 *
 * SOURCE OF TRUTH: 49 CFR §396.11 (Driver vehicle inspection report) read with
 * Appendix G to Subchapter B (Minimum Periodic Inspection Standards).  Codes are
 * stable identifiers owned by this module — do not renumber existing entries.
 */

export type DvirSeverity = "major" | "minor" | "observation";

export type MajorDefectCode = {
  code: string;
  label: string;
  cfr: string;
  /** Lower-cased keywords used by the heuristic classifier. */
  keywords: string[];
};

export const MAJOR_DEFECT_CODES: readonly MajorDefectCode[] = [
  { code: "BRAKE_AIR_LEAK", label: "Air brake system leak", cfr: "396.11(a)(2)", keywords: ["air brake", "brake leak", "air leak", "brake chamber"] },
  { code: "BRAKE_PADS_WORN", label: 'Brake pads/lining below 1/8"', cfr: "396.11(a)(2)", keywords: ["brake pad", "brake lining", "worn brake", "brake shoe"] },
  { code: "BRAKE_PUSHROD_TRAVEL", label: "Brake pushrod travel out of adjustment", cfr: "396.11(a)(2)", keywords: ["pushrod", "slack adjuster", "out of adjustment"] },
  { code: "STEERING_LOOSE", label: "Steering wheel free play >10deg", cfr: "396.11(a)(3)", keywords: ["steering", "free play", "loose steering", "play in wheel"] },
  { code: "TIRE_FLAT", label: "Tire flat or below tread depth", cfr: "396.11(a)(4)", keywords: ["flat tire", "tire flat", "flat", "tread depth", "bald tire", "low tread"] },
  { code: "TIRE_SIDEWALL", label: "Tire sidewall damage with exposed cord/ply", cfr: "396.11(a)(4)", keywords: ["sidewall", "exposed cord", "exposed ply", "tire cut", "tire bulge"] },
  { code: "WHEEL_FASTENER", label: "Loose/missing wheel fastener or cracked rim", cfr: "396.11(a)(4)", keywords: ["lug nut", "wheel fastener", "cracked rim", "missing lug"] },
  { code: "LIGHTS_HEADLIGHT", label: "Required headlight inoperative", cfr: "396.11(a)(5)", keywords: ["headlight", "head lamp", "no headlight"] },
  { code: "LIGHTS_BRAKE_TAIL", label: "Brake light or tail lamp inoperative", cfr: "396.11(a)(5)", keywords: ["brake light", "tail light", "tail lamp", "stop lamp"] },
  { code: "COUPLING_FIFTH_WHEEL", label: "Fifth wheel coupling damaged/insecure", cfr: "396.11(a)(6)", keywords: ["fifth wheel", "5th wheel", "coupling"] },
  { code: "COUPLING_KING_PIN", label: "King pin worn or cracked", cfr: "396.11(a)(6)", keywords: ["king pin", "kingpin"] },
  { code: "COUPLING_SAFETY_CHAIN", label: "Missing/defective safety chain or pintle hook", cfr: "396.11(a)(6)", keywords: ["safety chain", "pintle", "tow hook"] },
  { code: "FRAME_CRACK", label: "Frame or chassis crack/fracture", cfr: "396.11(a)(7)", keywords: ["frame crack", "chassis crack", "broken frame", "cracked frame"] },
  { code: "FUEL_LEAK", label: "Fuel system leak", cfr: "396.11(a)(8)", keywords: ["fuel leak", "diesel leak", "leaking fuel", "fuel drip"] },
  { code: "EXHAUST_LEAK", label: "Exhaust system leak discharging into cab", cfr: "396.11(a)(9)", keywords: ["exhaust leak", "exhaust into cab", "fumes in cab"] },
  { code: "WINDSHIELD_BROKEN", label: "Windshield cracked/discolored in driver view", cfr: "396.11(a)(10)", keywords: ["windshield crack", "cracked windshield", "windshield broken", "windshield damage"] },
  { code: "WINDSHIELD_WIPERS", label: "Windshield wipers inoperative", cfr: "396.11(a)(11)", keywords: ["wiper inoperative", "wipers not working", "broken wiper", "no wipers"] },
  { code: "EMERGENCY_EQUIPMENT", label: "Missing required emergency equipment (extinguisher/triangles)", cfr: "396.11(a)(12)", keywords: ["fire extinguisher", "warning triangle", "emergency equipment", "no extinguisher"] },
  { code: "STEERING_LINKAGE", label: "Steering linkage/components defective", cfr: "396.11(a)(3)", keywords: ["tie rod", "drag link", "steering linkage", "ball joint"] },
  { code: "SUSPENSION_BROKEN", label: "Broken spring/leaf or suspension component", cfr: "396.11(a)(7)", keywords: ["broken spring", "leaf spring", "suspension", "broken u-bolt"] },
] as const;

const MAJOR_CODE_INDEX = new Map(MAJOR_DEFECT_CODES.map((entry) => [entry.code, entry]));

export function isMajorDefectCode(code: string | null | undefined): boolean {
  return Boolean(code && MAJOR_CODE_INDEX.has(code));
}

export function getMajorDefectCode(code: string): MajorDefectCode | undefined {
  return MAJOR_CODE_INDEX.get(code);
}

/**
 * Heuristic classifier: match a free-text defect description (and optional
 * category/item key) against the locked catalog.  Returns the matching major
 * code when found; callers treat a null result as a non-major (minor) defect.
 *
 * Conservative by design: any keyword hit promotes the defect to MAJOR so that
 * driver-safety / DOT-compliance risk is never silently downgraded.
 */
export function classifyMajorDefect(
  description: string | null | undefined,
  category?: string | null
): MajorDefectCode | null {
  const haystack = `${description ?? ""} ${category ?? ""}`.toLowerCase();
  if (!haystack.trim()) return null;

  // Direct code reference (e.g. category === "BRAKE_AIR_LEAK") wins immediately.
  const upper = `${category ?? ""}`.trim().toUpperCase();
  if (MAJOR_CODE_INDEX.has(upper)) {
    return MAJOR_CODE_INDEX.get(upper) ?? null;
  }

  for (const entry of MAJOR_DEFECT_CODES) {
    if (entry.keywords.some((keyword) => haystack.includes(keyword))) {
      return entry;
    }
  }
  return null;
}
