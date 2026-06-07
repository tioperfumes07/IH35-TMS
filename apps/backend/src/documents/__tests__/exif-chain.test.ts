import { describe, expect, it } from "vitest";
import { appendCustodyEvent, getCustodyChain } from "../chain-of-custody.service.js";
import { validateAndPreserveExif } from "../exif-preserver.js";

function minimalJpegWithExif(): Buffer {
  const exifPayload = Buffer.alloc(128);
  exifPayload.writeUInt16LE(0x4949, 0);
  exifPayload.writeUInt32LE(0x002a, 2);
  exifPayload.writeUInt32LE(8, 4);
  exifPayload.writeUInt16LE(1, 8);
  exifPayload.writeUInt16LE(0x010f, 10);
  exifPayload.writeUInt16LE(2, 12);
  exifPayload.writeUInt32LE(4, 14);
  exifPayload.write("Canon", 18, 5);
  const exifHeader = Buffer.concat([Buffer.from("Exif\0\0"), exifPayload]);
  const app1 = Buffer.alloc(2 + exifHeader.length);
  app1.writeUInt16BE(exifHeader.length + 2, 0);
  exifHeader.copy(app1, 2);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), app1, Buffer.from([0xff, 0xd9])]);
}

describe("exif-preserver", () => {
  it("computes sha256 and extracts Make when EXIF segment present", () => {
    const buffer = minimalJpegWithExif();
    const result = validateAndPreserveExif(buffer);
    expect(result.sha256).toHaveLength(64);
    expect(result.metadata.Make).toBe("Canon");
  });
});

describe("chain-of-custody", () => {
  it("appends custody events and rejects deletion", () => {
    const chain = appendCustodyEvent([], {
      event_kind: "uploaded",
      user_uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      details: {},
      sha256_at_event: "abc",
    });
    expect(chain).toHaveLength(1);
    expect(() =>
      appendCustodyEvent(chain, {
        event_kind: "deleted",
        user_uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        details: {},
        sha256_at_event: "abc",
      })
    ).toThrow("deletion_rejected");
    expect(getCustodyChain(chain)[0]?.event_kind).toBe("uploaded");
  });
});
