import { describe, expect, it, vi } from "vitest";

vi.mock("../../../storage/r2-client.js", () => ({
  generatePresignedDownloadUrl: vi.fn(async (key: string) => ({
    url: `https://example.test/${key}`,
    expires_in_seconds: 900,
    bucket: "test",
  })),
}));

import {
  aggregateStatus,
  HIGH_CONFIDENCE_THRESHOLD,
  pairByAngle,
  runDiff,
} from "../diff-engine.service.js";
import type { PhotoEvidenceDetail } from "../session.service.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DRIVER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const UNIT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function photo(id: string, angle: string, url?: string): PhotoEvidenceDetail {
  return {
    id,
    r2_object_key: `key/${id}`,
    sha256_hash: "abc123",
    exif_metadata: { angle_label: angle },
    custody_events: [],
    angle_label: angle,
    download_url: url,
  };
}

function mockClient(handlers: Array<[string | RegExp, Record<string, unknown>[]]>) {
  const query = vi.fn(async (sql: string) => {
    for (const [matcher, rows] of handlers) {
      const matched = matcher instanceof RegExp ? matcher.test(sql) : sql.includes(matcher);
      if (matched) return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  });
  return { client: { query }, query };
}

describe("diff-engine (GAP-50)", () => {
  it("pairs pre/post photos by angle_label", () => {
    const pairs = pairByAngle(
      [photo("p1", "front"), photo("p2", "rear")],
      [photo("q1", "rear"), photo("q2", "front")]
    );
    expect(pairs).toHaveLength(2);
    expect(pairs.find((p) => p.angle === "front")?.pre.id).toBe("p1");
    expect(pairs.find((p) => p.angle === "front")?.post.id).toBe("q2");
  });

  it("marks high-confidence findings as damage_detected", () => {
    expect(
      aggregateStatus([
        {
          angle_label: "front",
          pre_evidence_uuid: "p1",
          post_evidence_uuid: "q1",
          has_new_damage: true,
          findings: [{ location: "bumper", severity: "moderate", description: "dent", confidence: 0.95 }],
        },
      ])
    ).toBe("damage_detected");
  });

  it("marks low-confidence findings as review_required", () => {
    expect(
      aggregateStatus([
        {
          angle_label: "rear",
          pre_evidence_uuid: "p2",
          post_evidence_uuid: "q2",
          has_new_damage: true,
          findings: [{ location: "tail", severity: "minor", description: "scratch", confidence: 0.4 }],
        },
      ])
    ).toBe("review_required");
    expect(HIGH_CONFIDENCE_THRESHOLD).toBe(0.8);
  });

  it("auto-creates damage report on damage_detected and updates session", async () => {
    const sessionRow = {
      uuid: SESSION,
      operating_company_id: COMPANY,
      load_uuid: null,
      driver_uuid: DRIVER,
      unit_uuid: UNIT,
      pre_trip_session_at: "2026-06-07T12:00:00.000Z",
      pre_trip_evidence_uuids: ["p1"],
      post_trip_session_at: "2026-06-07T18:00:00.000Z",
      post_trip_evidence_uuids: ["q1"],
      diff_status: "analyzing",
      diff_findings: null,
      diff_summary: null,
      diff_completed_at: null,
      auto_damage_report_uuid: null,
      created_at: "2026-06-07T12:00:00.000Z",
    };

    const evidenceById: Record<string, Record<string, unknown>> = {
      p1: {
        id: "p1",
        r2_object_key: "pre/front.jpg",
        sha256_hash: "sha-pre",
        exif_metadata: { angle_label: "front" },
        custody_events: [],
      },
      q1: {
        id: "q1",
        r2_object_key: "post/front.jpg",
        sha256_hash: "sha-post",
        exif_metadata: { angle_label: "front" },
        custody_events: [],
      },
    };

    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM safety.photo_comparison_sessions")) return { rows: [sessionRow], rowCount: 1 };
      if (sql.includes("FROM documents.damage_photo_evidence")) {
        const ids = (values?.[1] as string[]) ?? [];
        return { rows: ids.map((id) => evidenceById[id]).filter(Boolean), rowCount: ids.length };
      }
      if (sql.includes("INSERT INTO safety.incidents")) {
        return { rows: [{ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO safety.damage_continuity_chains")) {
        return { rows: [{ uuid: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" }], rowCount: 1 };
      }
      if (sql.includes("UPDATE safety.photo_comparison_sessions")) return { rows: [], rowCount: 0 };
      if (sql.includes("UPDATE safety.incidents")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });
    const client = { query };

    const anthropicClient = {
      compareImages: vi.fn().mockResolvedValue({
        has_new_damage: true,
        findings: [{ location: "bumper", severity: "severe", description: "crack", confidence: 0.92 }],
      }),
    };

    const result = await runDiff(client, COMPANY, SESSION, anthropicClient);
    expect(result.diff_status).toBe("damage_detected");
    expect(result.auto_damage_report_uuid).toBe("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    expect(anthropicClient.compareImages).toHaveBeenCalledOnce();

    const sessionLookup = query.mock.calls.find((c) => String(c[0]).includes("photo_comparison_sessions"));
    expect(String(sessionLookup?.[0])).toContain("operating_company_id");
  });

  it("returns clean when Anthropic finds no new damage", async () => {
    const sessionRow = {
      uuid: SESSION,
      operating_company_id: COMPANY,
      load_uuid: null,
      driver_uuid: DRIVER,
      unit_uuid: UNIT,
      pre_trip_session_at: "2026-06-07T12:00:00.000Z",
      pre_trip_evidence_uuids: ["p1"],
      post_trip_session_at: "2026-06-07T18:00:00.000Z",
      post_trip_evidence_uuids: ["q1"],
      diff_status: "analyzing",
      diff_findings: null,
      diff_summary: null,
      diff_completed_at: null,
      auto_damage_report_uuid: null,
      created_at: "2026-06-07T12:00:00.000Z",
    };

    const { client } = mockClient([
      ["FROM safety.photo_comparison_sessions", [sessionRow]],
      ["FROM documents.damage_photo_evidence", [
        {
          id: "p1",
          r2_object_key: "pre/front.jpg",
          sha256_hash: "sha-pre",
          exif_metadata: { angle_label: "front" },
          custody_events: [],
        },
        {
          id: "q1",
          r2_object_key: "post/front.jpg",
          sha256_hash: "sha-post",
          exif_metadata: { angle_label: "front" },
          custody_events: [],
        },
      ]],
      ["UPDATE safety.photo_comparison_sessions", []],
    ]);

    const anthropicClient = {
      compareImages: vi.fn().mockResolvedValue({ has_new_damage: false, findings: [] }),
    };

    const result = await runDiff(client, COMPANY, SESSION, anthropicClient);
    expect(result.diff_status).toBe("clean");
    expect(result.auto_damage_report_uuid).toBeNull();
  });
});
