import type { PlaceRecommendation, SearchRequest, SearchResponse } from "../domain";

export const AI_CANDIDATE_LIMIT = 6;
export const AI_RECOMMENDATION_LIMIT = 3;
export const AI_REASON_LIMIT = 120;
export const OPENAI_MODEL = "gpt-5.4-nano-2026-03-17";
export const PROMPT_VERSION = "curation-v1";
export const MAX_OUTPUT_TOKENS = 300;

export interface AiCandidate {
  id: string;
  name: string;
  category: string;
  tags: string[];
  transportTip: string | null;
}

export interface AiRecommendation {
  placeId: string;
  evidence: string[];
  reason: string;
}

export interface AiCuration {
  recommendations: AiRecommendation[];
}

export interface CuratorInput {
  taste: string;
  transport: SearchRequest["transport"];
  candidates: AiCandidate[];
}

export interface CuratorUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CuratorResult {
  curation: AiCuration;
  usage: CuratorUsage;
}

export interface AiCurator {
  curate(input: CuratorInput): Promise<CuratorResult>;
}

export interface CurationContext {
  db: D1Database;
  userId: string;
  preferenceUpdatedAt: string;
  request: SearchRequest;
  deterministic: SearchResponse;
  curator: AiCurator | null;
  now?: Date;
}

export function toAiCandidate(place: PlaceRecommendation): AiCandidate {
  return {
    id: place.id,
    name: place.name.slice(0, 120),
    category: place.category.slice(0, 120),
    tags: place.tags.slice(0, 8).map((tag) => tag.slice(0, 80)),
    transportTip: place.transitTip?.slice(0, 200) ?? null,
  };
}
