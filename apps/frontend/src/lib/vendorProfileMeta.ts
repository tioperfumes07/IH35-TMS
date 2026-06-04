import { scrubQboArchiveProjectionNotes } from "./qboArchiveNotes.js";

export const VENDOR_PROFILE_META_PREFIX = "IH35_VENDOR_PROFILE_V1::";

export type VendorQualityRating = "good" | "medium" | "bad";

export type FactoringProfileMeta = {
  factoringReservesPct: string;
  escrowReservesPct: string;
  lateFeesPct: string;
  chargebacksPct: string;
  advanceRate31To60Pct: string;
  advanceFee31To60Pct: string;
  advanceRate61To90Pct: string;
  advanceFee61To90Pct: string;
};

export type VendorProfileMeta = {
  telephone: string;
  address: string;
  primaryContactName: string;
  primaryContactTitle: string;
  primaryContactPhone: string;
  primaryContactEmail: string;
  secondaryContactName: string;
  secondaryContactTitle: string;
  secondaryContactPhone: string;
  secondaryContactEmail: string;
  generalEmail: string;
  accountingContact: string;
  disputesContact: string;
  qualityRating: VendorQualityRating;
  factoring: FactoringProfileMeta;
};

export function emptyFactoringProfileMeta(): FactoringProfileMeta {
  return {
    factoringReservesPct: "",
    escrowReservesPct: "",
    lateFeesPct: "",
    chargebacksPct: "",
    advanceRate31To60Pct: "",
    advanceFee31To60Pct: "",
    advanceRate61To90Pct: "",
    advanceFee61To90Pct: "",
  };
}

export function emptyVendorProfileMeta(): VendorProfileMeta {
  return {
    telephone: "",
    address: "",
    primaryContactName: "",
    primaryContactTitle: "",
    primaryContactPhone: "",
    primaryContactEmail: "",
    secondaryContactName: "",
    secondaryContactTitle: "",
    secondaryContactPhone: "",
    secondaryContactEmail: "",
    generalEmail: "",
    accountingContact: "",
    disputesContact: "",
    qualityRating: "medium",
    factoring: emptyFactoringProfileMeta(),
  };
}

export function parseVendorNotes(notes: string | null | undefined): { publicNotes: string; meta: VendorProfileMeta } {
  const raw = scrubQboArchiveProjectionNotes(notes);
  if (!raw.startsWith(VENDOR_PROFILE_META_PREFIX)) {
    return { publicNotes: raw, meta: emptyVendorProfileMeta() };
  }
  const newline = raw.indexOf("\n");
  const jsonChunk = newline >= 0 ? raw.slice(VENDOR_PROFILE_META_PREFIX.length, newline) : raw.slice(VENDOR_PROFILE_META_PREFIX.length);
  const publicNotes = newline >= 0 ? raw.slice(newline + 1).trim() : "";
  try {
    const parsed = JSON.parse(jsonChunk) as Partial<VendorProfileMeta>;
    const base = emptyVendorProfileMeta();
    return {
      publicNotes,
      meta: {
        ...base,
        ...parsed,
        factoring: {
          ...base.factoring,
          ...(parsed.factoring ?? {}),
        },
      },
    };
  } catch {
    return { publicNotes: raw, meta: emptyVendorProfileMeta() };
  }
}

export function serializeVendorNotes(meta: VendorProfileMeta, publicNotes: string): string {
  return `${VENDOR_PROFILE_META_PREFIX}${JSON.stringify(meta)}\n${publicNotes.trim()}`.trim();
}
