#!/usr/bin/env tsx
// Lead ruling 148-02/149 (ROUND 149, 2026-09-27/28): verify-void-is-whole reports 242 Direction-1
// silent voids on production USMCA (218 fuel.fuel_transactions + 24 accounting.invoices) -- every
// linked journal entry is already dead (reversed), but the document header was never stamped
// voided_at/void_reason/voided_by_user_id. This is a HEADER-STAMP-ONLY fix. NO GL MATH. NO NEW
// REVERSAL. Calls the ONE existing single writer, stampDocumentVoided() (R-102.1-A), on each row --
// never a hand UPDATE, never a new stamper, never a seventh engine.
//
// verify-owner-authorization.mjs AUTH-075 required before this runs (verify-no-unauthorized-
// production-write.mjs law, ROUND 133).
//
// PER-ROW SAFETY (Lead order, verbatim): "assert per row that the GL really is fully reversed and
// nets to zero. Any row that does NOT net zero is not a silent void -- STOP on that row, list it,
// stamp the rest." This script re-runs the EXACT live_jes/dead_jes computation
// scripts/verify-void-is-whole.mjs itself uses (same SQL, same five-column liveness test) inside
// the SAME transaction as the stamp, immediately before writing -- never trusts the earlier
// discovery list alone. A row that no longer measures live_jes=0 AND dead_jes>0 is skipped and
// named, not stamped.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { withLuciaBypass } from "../../apps/backend/src/auth/db.js";
import { stampDocumentVoided, VoidDocumentStampError, type VoidDocumentFamily } from "../../apps/backend/src/accounting/void-document-stamp.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const VOID_REASON =
  "E10 fuel-void-runner R-102-C: GL reversed, header stamp completed 2026-09-28 under Lead ruling 148-02.";
const OWNER_AUTH_ID = process.env.OWNER_AUTH_ID;

if (OWNER_AUTH_ID !== "AUTH-075") {
  console.error(`FAIL: OWNER_AUTH_ID must be AUTH-075 (got ${JSON.stringify(OWNER_AUTH_ID ?? null)}).`);
  process.exit(1);
}
execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), "AUTH-075"], {
  stdio: "inherit",
});

// Exact liveness test from scripts/verify-void-is-whole.mjs -- do not drift from it.
const LIVE = `je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL
              AND je.reverses_je_id IS NULL AND p.reversed_by_line_id IS NULL`;

async function liveDeadCounts(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> }, linkType: string, docId: string) {
  const res = await client.query(
    `SELECT count(*) FILTER (WHERE ${LIVE})::int AS live_jes, count(*) FILTER (WHERE NOT (${LIVE}))::int AS dead_jes
       FROM accounting.transaction_source_links l
       JOIN accounting.journal_entry_postings p ON p.id = l.journal_entry_posting_id
       JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.operating_company_id = l.operating_company_id
      WHERE l.operating_company_id = $1 AND l.linked_object_type = $2 AND l.linked_object_id = $3 AND je.is_sample_data = false`,
    [USMCA_COMPANY_ID, linkType, docId]
  );
  const row = res.rows[0] ?? { live_jes: 0, dead_jes: 0 };
  return { live_jes: Number(row.live_jes), dead_jes: Number(row.dead_jes) };
}

type Outcome = "stamped" | "already_voided" | "skipped_not_all_dead";
const tally: Record<Outcome, number> = { stamped: 0, already_voided: 0, skipped_not_all_dead: 0 };
const skipped: string[] = [];
const errors: string[] = [];

async function stampOne(family: VoidDocumentFamily, linkType: string, docId: string) {
  try {
    await withLuciaBypass(async (client) => {
      const { live_jes, dead_jes } = await liveDeadCounts(client, linkType, docId);
      if (!(live_jes === 0 && dead_jes > 0)) {
        skipped.push(`${family}/${docId}: live_jes=${live_jes} dead_jes=${dead_jes} -- NOT a silent void, skipped`);
        tally.skipped_not_all_dead++;
        return;
      }
      const result = await stampDocumentVoided(client, {
        operatingCompanyId: USMCA_COMPANY_ID,
        family,
        documentId: docId,
        voidReason: VOID_REASON,
        voidedByUserId: OWNER_USER_ID,
      });
      if (result.already_voided) tally.already_voided++;
      else tally.stamped++;
    });
  } catch (e) {
    if (e instanceof VoidDocumentStampError) {
      errors.push(`${family}/${docId}: ${e.code} -- ${e.message}`);
    } else {
      errors.push(`${family}/${docId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

const FUEL_IDS: string[] = [
  "010f1af3-576d-45f1-a720-8627eb1a4626",
  "011cd550-5fa8-4d4e-92fe-6145338b0185",
  "01e037ce-ae19-4072-986e-63659b305ff6",
  "03351b3b-0b9c-41e4-b3ea-ff9968530207",
  "03aa238a-aa67-4a24-8b0d-e16125a928a0",
  "05accb29-f960-4d23-a4c9-8998a3cab260",
  "0694a502-b53f-45f8-bb3e-fb93acb83671",
  "07305d69-37d6-480a-b068-26fb152cff96",
  "07dfb42d-c14a-41f5-8f09-8895313aed77",
  "0942a693-fd5e-4f0f-aa0c-2dbe8716fafa",
  "097923fb-a434-4b75-9ba1-5dd45af72c05",
  "0a6fb45c-1066-4520-b02b-503759841600",
  "0bdd5989-56f0-4844-a420-6d370272e956",
  "0bfbe85f-c116-4703-bc3b-9cb4c8ff2e93",
  "0f1bb337-d78c-404a-a50c-68b0bdb8509d",
  "0f225958-b311-42a2-bb8b-7f9f2ed97e81",
  "102517ec-46e3-4d43-a7e3-74b40d4ddc83",
  "11080b24-247e-400e-beb5-59ed5efd2a26",
  "1207757d-03eb-4b30-8d96-2bbe30a346fe",
  "1407c4f7-b734-496d-b29b-d067de65ba48",
  "156b6507-a338-4d5b-a622-3fa3adf27dc5",
  "17741351-48de-49bf-b2b4-7e5e580331dc",
  "18995afd-d874-4582-96ed-a18e9e9db584",
  "1910da5a-a98b-464f-bd71-850557d20bd0",
  "19e3e944-240f-4799-9d3a-6f2479b20376",
  "1a1058ed-b203-4ec2-901f-43cab4dbff30",
  "1b994c15-af76-4b9a-a5b5-cb8b7c06e037",
  "1b99b77d-e75f-451d-af72-103222a16588",
  "1d47ed86-b944-46af-b981-d5561d940f74",
  "1f292842-0bff-47e1-b440-e77979863905",
  "21b7a964-f806-4d64-94e8-405b3468945b",
  "22e9532c-547e-4c0e-89f9-0a411700d35c",
  "249e0d89-f88a-4613-972e-eb4ed5c7e44b",
  "24b04710-ceae-48c4-9c80-22fe59b59fd3",
  "257f658b-60d0-421b-b1d2-20eb77ff3955",
  "260f724b-1322-4852-9c44-feb0e0bd64d9",
  "273a97c0-fbe2-4453-a513-c8544b8243b8",
  "27ad1398-7eb3-4732-8d45-04af1946595f",
  "28307b63-410e-4b97-aba0-ed53f894a486",
  "28725dac-b3f4-458f-a922-fbe3707e55bf",
  "29b1c4c3-54d8-4587-9a2c-ac93f86c4b32",
  "2a27f7e2-d742-4ad0-aefc-94f1f06e5352",
  "2cac58d1-0bef-4fc5-905a-eddeb108347c",
  "2ef6e16b-d601-4455-b8c1-89d88a5eed70",
  "2f0e7195-7d7d-46f9-858a-7c66e1193325",
  "306c989b-1ad1-4338-a66a-4da43fe65d32",
  "3070df59-280b-456f-922c-3d4157d6050c",
  "308b26eb-db71-4f35-8a95-3880254756ce",
  "32f3c617-2906-4824-95c8-735a3b63379c",
  "345b6d6c-4c61-40a0-96dc-073229d4e68d",
  "3516a1ed-33e2-40f9-b72e-c9e2f062cf73",
  "364281ae-5251-4b39-86a1-dcb8ca67d4c4",
  "36ffffe1-6df1-469b-830e-17fa3ea6627f",
  "38626627-afa7-4967-a985-a61be49db415",
  "3a654347-0a0c-4836-ba37-eb9d3ab49a9b",
  "3b4ed3e6-0796-4316-bf86-da85a8f0d0a5",
  "3b8f687d-e3f3-4279-acca-00795d7355d0",
  "3c44f365-be91-4317-a0db-4082a0ddd2a0",
  "3c82626c-077c-4c21-ace8-4c75871141db",
  "3d7a78bf-d481-43ab-96c7-0d70f4133cec",
  "41d98b29-b404-4e95-b4d4-a9d9d8e86dc8",
  "43256f20-d826-4843-a775-75f5680dc864",
  "445f62a4-50e0-4eda-8f97-ac118b2f3e17",
  "4620ad3e-40ac-4046-a0a4-1023ef1e1b94",
  "470d3fb8-0d4a-4997-b1b5-41c98af680ba",
  "48c8aa67-040b-48f4-a6eb-bd6a7a742349",
  "4a20d353-f8f8-4787-8816-f10d80e8f77a",
  "4bd53f1a-80cf-42aa-9156-a69588264ee9",
  "4dc06d0c-c18d-436b-8266-9e56b3944394",
  "4e6a69de-c558-4651-964e-4be780239dfb",
  "4ea6e7eb-b9f4-414b-9a92-141c4ca186cc",
  "4f43925b-faa9-4a63-bb55-29d8e3bf66f6",
  "502c3aae-3884-4b91-ba80-acd07002cfdb",
  "512a469d-666a-4b18-8784-7a5dcd680770",
  "54a35bd1-f4b5-4737-8ef6-cb8ea7081f26",
  "56627fdf-6bf6-476b-a6ee-d8b5452ac1cf",
  "57518b5c-ad3b-4b9f-bf40-5b6141bfbd1e",
  "58d6a2bc-aba9-4199-ac8c-9a826bcb7e35",
  "5bc668d6-7b58-4d6e-916b-21e1f7ea4a25",
  "5cfbc447-6991-43c8-9704-1fca03093d18",
  "5d0babd7-0024-4f68-b075-e8126a1765cf",
  "5d5c8dcd-1116-4ed7-ad99-d3502cf654bb",
  "5d82dec0-9dfe-4276-9614-9b012dc2047d",
  "5dc91c9f-a9f0-48e9-ad43-d4348a231b92",
  "5fc4bfe5-f69d-4502-990e-ddd03cda7a62",
  "60452d04-09a3-4603-bdbb-bff1d77a8db4",
  "614cd735-79ab-4a24-90be-1b27c479f5bd",
  "6171784d-9766-4958-bec0-b5c6dbe8dc62",
  "626a95ca-35bd-4e54-a903-712fa0ac869f",
  "6315ec83-6571-4eb9-958c-5f3c4247a666",
  "64e9a841-d6dd-41dd-91f4-bd2f131cfed6",
  "64f5c3b5-b1e1-46d2-a15f-0cf4747caa26",
  "6595b5e9-34d0-4ca1-9eb3-33b9c622c7ff",
  "6639480e-6035-4ba3-b970-f9e48181a53c",
  "6c33a4e0-588c-4dec-8791-4be5f1f5a4e0",
  "6d31dda4-b644-44b9-a212-7c02ca7b160e",
  "6ee5a0ee-5765-42cb-81d1-4f33cc2f8802",
  "6f0160cf-f17e-443d-804a-41f2c98b12c6",
  "6f17f4eb-6613-4f6a-8174-c718fafa14f3",
  "6f3c3274-6abf-41d9-b695-0666a7d5bb35",
  "6f93a500-d9ef-4830-a5be-2127a7c7daef",
  "73208082-15d6-443c-a745-ddae127bdf52",
  "755a8786-a73c-405d-b4ca-1bd0abc7ae54",
  "75c84e98-bceb-4713-84bb-8da18549e898",
  "76c2f38b-940f-4d27-b4c1-4acc4baeeae7",
  "7890e337-ecb7-4fb2-aa01-91d8853a414f",
  "78c5507c-36f8-4097-a8e7-e232b1f5ab65",
  "78efcdf8-4cd5-4b36-a88a-4bbb748f1da0",
  "7a6ae548-a5cf-47d9-b54c-b5b639dd042b",
  "7c0ba203-5d6c-4e79-b971-07dc6f18c829",
  "7c0e948e-5220-43c8-be0c-f7ca895257c5",
  "7ef2aa88-fdc3-44b8-a3e3-6122e0c600ad",
  "7ef7eebe-b87c-40c7-97c3-09e31e8a0723",
  "7f58d4f6-8673-4654-8d3f-939494054c9f",
  "7f93b8c0-639a-4f49-aa96-a0eecc06925e",
  "81bf97c8-de82-4438-b9c3-1ad0e870cf91",
  "82f83d96-fa91-46f7-abec-8d1fc573b942",
  "8387ca6e-4898-4100-84ef-eaf7a95178ba",
  "839f32e6-39d4-4a55-96ee-724d93e7a09a",
  "842afcdc-4e5a-464d-a6a5-c9fc178b06cc",
  "84578a6a-9d2d-41c8-bc2d-e93fed536454",
  "86658559-6dd3-4b1d-b680-de9d3374a92c",
  "88f7001b-5dc9-46a9-8b44-413d87bdeb93",
  "890335c8-2aa1-4eac-a517-d50dd44c0240",
  "8af75476-e1bb-414c-bead-9219f1add8c0",
  "8b6e0186-51bd-4850-84cb-a06b958b9d36",
  "8daec35f-599d-4c10-8651-71738f392a56",
  "8e465a90-aca3-45dc-9455-1f49b81df485",
  "8e96d4b4-8942-451c-bbe0-095032caca2e",
  "8ea3f245-e22c-4b92-bee5-af2c3f17d72c",
  "90eeaa12-dc53-4e15-837e-bbf09b17e37e",
  "9110495a-5252-4e28-a3a7-c469d3d76f2b",
  "9124993a-01c0-4ca1-a1ce-851196795246",
  "91a7706d-e74b-45de-a7df-9d112957886e",
  "925be747-8df0-4283-b048-b85783999f70",
  "93bf905d-6442-4f8f-b701-8521fe3a93d3",
  "94890d41-f5d8-40b9-a44b-18f5b5fca9c4",
  "98b33c94-b696-4ab2-81c4-8740a0100811",
  "995accb4-5c5c-4522-989e-96ed9100771d",
  "9b2b027e-dfbc-4467-a9d6-f7803a5913d7",
  "9ede0c85-8962-4057-b30e-9a940367e0a6",
  "a1ebca71-7876-4a3b-8781-a581e81dbd49",
  "a296ba47-e88d-486c-9170-ac66ee2918c3",
  "a312f380-7205-485a-a1bb-fa99c936b026",
  "a442cdf1-2ceb-4c07-a490-287c7d65f30a",
  "a47ba2da-9797-49fe-8af2-d6f68099af87",
  "a4b97807-edb8-481f-9c2f-0f50a039e706",
  "a72ca92b-18b4-4c25-af3a-ba7d2f4da30b",
  "aa5f0e9c-2115-498a-b1b1-44214344ed3f",
  "aa7a00a0-28c6-486e-86c5-d4ee881ea771",
  "aca09a5c-9484-464b-98a4-cbbac04f5ddd",
  "aceaf7bc-3d4c-4e82-9867-333e3662a41f",
  "ae05a6d0-9d4f-4e6e-b357-02ca9318670b",
  "aec2aa25-78ff-445a-98f9-eb94d1f223a6",
  "af2ee79b-25de-4618-8d30-550efa8e6292",
  "b0021579-de74-4377-a226-f5079d646334",
  "b1f29497-642f-4d65-8ddb-f544db8e385c",
  "b3e3a74b-86e9-4f88-b2f0-bb5db94f4ac0",
  "b6d36712-6c98-42d9-93e5-5c00c239b5bc",
  "b7b049eb-e3b0-4d57-bbd0-8db38cf42274",
  "b96bb1e4-d677-4fa6-8ddc-fb7c97089f4d",
  "b9e9dc30-9bbb-4a0a-9bd1-0ce4389d8f2b",
  "bbc53346-9e3e-41c9-8a62-cdd72e380744",
  "bc1c4be5-0c6c-4a4d-8e6e-012f49afdcba",
  "bcf269a6-99d8-4828-87ae-a1119e1fd9bb",
  "bd2f8978-5da2-47ea-ba0f-681501892744",
  "bd835e3d-86b4-4cea-ad4f-f21a1b7c9998",
  "be2ca9ec-aa4f-4907-ac53-61a429599d9b",
  "be43e307-f15e-4b07-ac9a-8155f9aa464c",
  "bea394ec-1aa4-4da2-b341-2aaf68149aef",
  "beca1ba6-bff2-4fa3-8bd5-7824fc517e81",
  "bfc3d945-c04d-4f6b-9fe5-5eafc4436161",
  "c0b845b5-204d-4f25-bac5-f551dd643bcc",
  "c1d2ecc4-5a1b-4fe0-808c-c375275488bb",
  "c4589ad4-932d-4e65-9b75-121bc0c2f05d",
  "c477d9c5-ebce-4663-aae4-2e77441c9117",
  "c505e161-3bcb-40a7-b021-838ab0c83877",
  "c661ac18-2273-48a6-939c-ae5e531dad48",
  "c6ff29e5-c02f-4ebd-bec0-03b04e0be798",
  "c93014f7-79bf-4711-8515-4879fa255969",
  "ca292f5d-89d2-40e4-8199-29adbc75284e",
  "cae0fb43-17a9-4c50-860a-bdc4952c5873",
  "cfca4b19-37d8-47ca-a719-85827272df4e",
  "d5507826-dad7-4888-b266-98e162ab0cdd",
  "d5e58393-93a9-4f01-b5d5-f15ad0ff7422",
  "d6b146ab-8699-44b2-9d6c-74f41d564cab",
  "d8735241-33aa-44f9-a8b6-b58ea9d0988c",
  "d9d4b2de-930b-49cc-b464-b4d11af7b7ea",
  "dbc80949-40e5-4ec5-94b1-015d0e549093",
  "dc0ec741-476a-44dc-a38a-d1185ea2e1a4",
  "dd151a4e-2598-4dbe-b491-755521756f4b",
  "ddab18a6-a96f-4585-95ff-6d95e66beea6",
  "ddd39a08-549d-433a-bddb-b630465a920d",
  "dde51aae-e562-45b7-aa8b-3edbb32d5933",
  "deb06d8d-7d49-4aba-a507-e44e91d7f868",
  "e0e708d4-247a-4d11-a168-45c8dab269b6",
  "e1d13b57-9162-4b50-abce-d8520db59144",
  "e2075fc9-c03b-4420-822e-95773ba31bec",
  "e267b7b0-87e3-4d99-8e15-212cb6c3563e",
  "e2ffba99-928a-415e-9831-b93639555043",
  "e8b7fc85-4e16-4cc8-865e-2df2cfcbc0b4",
  "e91dccc4-1487-4787-adb6-a83b12dcfc7b",
  "e999414b-1cbe-405b-9522-774012273b47",
  "eae4f5a9-e65c-49dd-880c-3f40f76fc7e9",
  "eb94d0ed-50ce-43b3-a093-1c01e4ad9c65",
  "ee3abc13-1388-4d9e-8032-ab31fca09364",
  "eee0a63b-3e8a-42d7-91af-c95131b68097",
  "eee49acf-e150-40b0-be76-20e2dbb1c52a",
  "eef9a70a-3faa-4a2b-92c4-0a14f80e5836",
  "efdba4cb-b9c5-4a55-83c5-c94b2bb55c11",
  "f3abb7e0-5d8b-476f-9ff1-b495a5b2c991",
  "f3dbd3c9-2b03-4add-8503-0a31b76778e2",
  "f41f80f3-2464-4c8d-b50e-6973f623597a",
  "f5dbb1fa-0312-4119-815d-674ff01ac3fa",
  "f6285d25-d026-4454-a93c-77c42141e799",
  "f6288dbf-bf4f-4bdb-955b-041ba7131f59",
  "fc9613cc-5733-42bb-bb00-e405895eaa97",
  "fd6cc0be-72dd-4867-a7c7-93a9a7ecbfa4",
];
const INVOICE_IDS: string[] = [
  "0cc2a96c-0631-42dc-8a59-0dca7d45c25d",
  "0fdc1b7f-c897-42e1-b5ee-ee8cb81e9f55",
  "18c041cb-380a-4a2e-bd54-9197e88d2e86",
  "1dc4c262-3f48-4aec-8cbd-95675899e58c",
  "27b6a6e5-6649-4a43-bee7-46d6e9f8dca5",
  "317da69a-0057-4e68-8311-189f83b209f2",
  "341db418-13ab-4fc4-862e-5da3e654a085",
  "3beb791b-30e6-4c13-8099-cecc7f077941",
  "413aa999-c465-4129-afc6-65126c0a7508",
  "4901cb98-c8c9-44e4-89bd-ecaa9791ff15",
  "49c44322-4660-4212-bbae-4965198ebea7",
  "5417d83c-a264-4b1a-92b2-a3b8b2dbbe57",
  "5ccbd80b-10f9-4716-acf4-e4e327342b0d",
  "6635babf-c7d4-48cb-affa-37e4c3f7f2d5",
  "6dbbd241-815a-4a28-8b90-adbde2feee5c",
  "707f94b8-d2e0-4c8d-99ef-734f41c71e21",
  "78037cce-d86d-4615-9f1c-eb94c19d7b14",
  "7d6d0ea3-f06d-4d08-a4e8-6e907902df7b",
  "8152b9b7-a616-497f-b6fd-dc3d1e820148",
  "967af04d-4626-4416-8016-c12fefb9b62e",
  "b3bf27c8-6544-4767-8879-1badeb42d561",
  "da51e218-463f-45cb-afa0-13e396ba18ea",
  "eef162b6-91b3-4e82-ba53-d5da4f6d767e",
  "f6be884a-1ca2-4afe-abb0-0757ac42e2e6",
];

async function main() {
  console.log(`Stamping ${FUEL_IDS.length} fuel_transaction + ${INVOICE_IDS.length} invoice silent-voids under ${OWNER_AUTH_ID}.`);
  for (const id of FUEL_IDS) await stampOne("fuel_transaction", "fuel_event", id);
  for (const id of INVOICE_IDS) await stampOne("invoice", "invoice", id);

  console.log(`\nTally: stamped=${tally.stamped} already_voided=${tally.already_voided} skipped_not_all_dead=${tally.skipped_not_all_dead} errors=${errors.length}`);
  if (skipped.length) {
    console.log(`\nSKIPPED (not actually all-dead at stamp time -- STOP, do not force):`);
    for (const s of skipped) console.log(`  - ${s}`);
  }
  if (errors.length) {
    console.log(`\nERRORS:`);
    for (const e of errors) console.log(`  - ${e}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
