import { apiRequest } from "./client";

export type ReconBlock = {
  id: string;
  source: string;
  fin: boolean;
  tier: string;
  status: string;
  evidence: string;
  name: string;
  registered_on: string | null;
  pr: number | null;
};

export type ExtraItem = {
  id: string;
  name: string;
  wave: string;
  type?: string;
  status: string;
  tier: string;
  fin: boolean;
  registered_on: string | null;
  notes?: string;
  track?: "owner-batch" | "dispatch-kit";
};

export type SequenceStep = { step: number; label: string };

export type BoardNote = {
  id: string;
  block_id: string | null;
  kind: "question" | "answer" | "idea" | "note";
  author: "agent" | "owner";
  body: string;
  status: string;
  created_at: string;
  created_at_ct: string;
};

export type ProgramBoard = {
  generated_at_ct: string;
  source_generated_on: string | null;
  counts: Record<string, number>;
  universe: unknown;
  blocks: ReconBlock[];
  extra: ExtraItem[];
  sequence: SequenceStep[];
  notes: BoardNote[];
  warnings: string[];
};

export async function getProgramBoard(): Promise<ProgramBoard> {
  return apiRequest<ProgramBoard>("/api/v1/program/board");
}

export async function postProgramBoardNote(input: {
  block_id?: string | null;
  kind: "answer" | "idea" | "note";
  body: string;
}): Promise<BoardNote> {
  return apiRequest<BoardNote>("/api/v1/program/board/notes", {
    method: "POST",
    body: input,
  });
}
