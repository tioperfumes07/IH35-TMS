import { createHash } from "node:crypto";

export type ExifMetadata = {
  DateTimeOriginal?: string;
  GPSLatitude?: number;
  GPSLongitude?: number;
  Make?: string;
  Model?: string;
  Software?: string;
};

export type ExifValidationResult = {
  metadata: ExifMetadata;
  sha256: string;
  exifPresent: boolean;
  missingFields: string[];
};

function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function readUInt16(buffer: Buffer, offset: number, littleEndian: boolean): number {
  return littleEndian ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
}

function readUInt32(buffer: Buffer, offset: number, littleEndian: boolean): number {
  return littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
}

function rationalToNumber(buffer: Buffer, offset: number, littleEndian: boolean): number | undefined {
  const num = readUInt32(buffer, offset, littleEndian);
  const den = readUInt32(buffer, offset + 4, littleEndian);
  if (den === 0) return undefined;
  return num / den;
}

function parseExifIfd(buffer: Buffer, ifdOffset: number, littleEndian: boolean): ExifMetadata {
  const metadata: ExifMetadata = {};
  const entryCount = readUInt16(buffer, ifdOffset, littleEndian);
  for (let i = 0; i < entryCount; i += 1) {
    const entryOffset = ifdOffset + 2 + i * 12;
    const tag = readUInt16(buffer, entryOffset, littleEndian);
    const type = readUInt16(buffer, entryOffset + 2, littleEndian);
    const count = readUInt32(buffer, entryOffset + 4, littleEndian);
    const valueOffset = entryOffset + 8;
    const inline = type === 2 ? buffer.toString("ascii", valueOffset, valueOffset + Math.min(count, 4)).replace(/\0/g, "") : "";

    if (tag === 0x9003 && type === 2) {
      const strOffset = count > 4 ? readUInt32(buffer, valueOffset, littleEndian) : valueOffset;
      metadata.DateTimeOriginal = buffer.toString("ascii", strOffset, strOffset + count).replace(/\0/g, "").trim();
    }
    if (tag === 0x010f && type === 2) {
      const strOffset = count > 4 ? readUInt32(buffer, valueOffset, littleEndian) : valueOffset;
      metadata.Make = buffer.toString("ascii", strOffset, strOffset + count).replace(/\0/g, "").trim();
    }
    if (tag === 0x0110 && type === 2) {
      const strOffset = count > 4 ? readUInt32(buffer, valueOffset, littleEndian) : valueOffset;
      metadata.Model = buffer.toString("ascii", strOffset, strOffset + count).replace(/\0/g, "").trim();
    }
    if (tag === 0x0131 && type === 2) {
      const strOffset = count > 4 ? readUInt32(buffer, valueOffset, littleEndian) : valueOffset;
      metadata.Software = buffer.toString("ascii", strOffset, strOffset + count).replace(/\0/g, "").trim();
    }
    if (tag === 0x8825 && type === 4 && count === 1) {
      const gpsIfdOffset = readUInt32(buffer, valueOffset, littleEndian);
      const gps = parseGpsIfd(buffer, gpsIfdOffset, littleEndian);
      if (gps.lat != null) metadata.GPSLatitude = gps.lat;
      if (gps.lng != null) metadata.GPSLongitude = gps.lng;
    }
    if (tag === 0x8825 && type === 2 && inline) {
      // no-op fallback
    }
  }
  return metadata;
}

function parseGpsIfd(buffer: Buffer, ifdOffset: number, littleEndian: boolean): { lat?: number; lng?: number } {
  let latRef = "N";
  let lngRef = "E";
  let latParts: number[] | undefined;
  let lngParts: number[] | undefined;
  const entryCount = readUInt16(buffer, ifdOffset, littleEndian);
  for (let i = 0; i < entryCount; i += 1) {
    const entryOffset = ifdOffset + 2 + i * 12;
    const tag = readUInt16(buffer, entryOffset, littleEndian);
    const type = readUInt16(buffer, entryOffset + 2, littleEndian);
    const count = readUInt32(buffer, entryOffset + 4, littleEndian);
    const valueOffset = entryOffset + 8;
    const dataOffset = count > 1 || type === 5 ? readUInt32(buffer, valueOffset, littleEndian) : valueOffset;
    if (tag === 1 && type === 2) latRef = buffer.toString("ascii", dataOffset, dataOffset + 1);
    if (tag === 3 && type === 2) lngRef = buffer.toString("ascii", dataOffset, dataOffset + 1);
    if (tag === 2 && type === 5 && count === 3) {
      latParts = [0, 1, 2].map((idx) => rationalToNumber(buffer, dataOffset + idx * 8, littleEndian) ?? 0);
    }
    if (tag === 4 && type === 5 && count === 3) {
      lngParts = [0, 1, 2].map((idx) => rationalToNumber(buffer, dataOffset + idx * 8, littleEndian) ?? 0);
    }
  }
  const toDecimal = (parts?: number[]) => {
    if (!parts || parts.length < 3) return undefined;
    return parts[0] + parts[1] / 60 + parts[2] / 3600;
  };
  let lat = toDecimal(latParts);
  let lng = toDecimal(lngParts);
  if (lat != null && latRef === "S") lat *= -1;
  if (lng != null && lngRef === "W") lng *= -1;
  return { lat, lng };
}

function extractExifSegment(buffer: Buffer): Buffer | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    const size = buffer.readUInt16BE(offset + 2);
    if (marker === 0xe1) {
      const segment = buffer.subarray(offset + 4, offset + 2 + size);
      if (segment.toString("ascii", 0, 6) === "Exif\0\0") return segment.subarray(6);
      return null;
    }
    if (marker === 0xda) break;
    offset += 2 + size;
  }
  return null;
}

export function validateAndPreserveExif(buffer: Buffer): ExifValidationResult {
  const sha256 = sha256Hex(buffer);
  const exif = extractExifSegment(buffer);
  const metadata: ExifMetadata = {};
  if (exif && exif.length >= 8) {
    const littleEndian = exif.readUInt16LE(0) === 0x4949;
    const ifd0 = readUInt32(exif, 4, littleEndian);
    Object.assign(metadata, parseExifIfd(exif, ifd0, littleEndian));
  }

  const missingFields: string[] = [];
  if (!metadata.DateTimeOriginal) missingFields.push("DateTimeOriginal");
  if (!metadata.Make) missingFields.push("Make");
  if (!metadata.Model) missingFields.push("Model");

  return {
    metadata,
    sha256,
    exifPresent: missingFields.length < 3,
    missingFields,
  };
}
