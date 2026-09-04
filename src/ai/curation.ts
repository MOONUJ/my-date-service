import type { PlaceRecommendation, SearchResponse } from "../domain";
import { AiCurationError } from "./openai-curator";
import { createCacheKey, readCurationCache, recordUsageTokens, reserveUsage, writeCurationCache } from "./store";
import { AI_CANDIDATE_LIMIT, OPENAI_MODEL, PROMPT_VERSION, type AiCuration, type CurationContext, toAiCandidate } from "./types";
import { validateCuration } from "./validation";

export async function applyAiCuration(context: CurationContext): Promise<SearchResponse> {
  if (!context.curator) return fallback(context.deterministic, "missing_key");
  const now = context.now ?? new Date();
  const candidates = context.deterministic.places.slice(0, AI_CANDIDATE_LIMIT).map(toAiCandidate);
  if (candidates.length === 0) return context.deterministic;
  const fingerprint = candidates.map((candidate) => JSON.stringify(candidate)).join("|");
  const cacheKey = await createCacheKey([
    context.userId, context.preferenceUpdatedAt, context.request.query, context.request.transport,
    fingerprint, OPENAI_MODEL, PROMPT_VERSION,
  ]);
  const cached = await readCurationCache(context.db, context.userId, cacheKey, now);
  const validCached = cached ? validateCuration({ recommendations: cached.recommendations.map(({ placeId, evidence, reason }) => ({ place_id: placeId, evidence, reason })) }, candidates) : null;
  if (validCached) return mergeCuration(context.deterministic, validCached, "cached");
  if (!(await reserveUsage(context.db, context.userId, now))) return fallback(context.deterministic, "budget_exhausted");

  try {
    const result = await context.curator.curate({ taste: context.request.taste, transport: context.request.transport, candidates });
    await writeCurationCache(context.db, context.userId, cacheKey, result.curation, now);
    await recordUsageTokens(context.db, context.userId, result.usage, now);
    return mergeCuration(context.deterministic, result.curation, "ai");
  } catch (error) {
    return fallback(context.deterministic, error instanceof AiCurationError ? error.code : "provider_error");
  }
}

function mergeCuration(base: SearchResponse, curation: AiCuration, source: "ai" | "cached"): SearchResponse {
  const byId = new Map(base.places.map((place) => [place.id, place]));
  const recommendations: PlaceRecommendation[] = [];
  for (const [index, item] of curation.recommendations.entries()) {
    const place = byId.get(item.placeId);
    if (place) recommendations.push({ ...place, rank: index + 1, reason: item.reason });
  }
  const selected = new Set(recommendations.map(({ id }) => id));
  const places = [...recommendations, ...base.places.filter(({ id }) => !selected.has(id))]
    .map((place, index) => ({ ...place, rank: index + 1 }));
  return recommendations.length === curation.recommendations.length
    ? { ...base, curation: { source }, recommendations: places.slice(0, recommendations.length), places }
    : fallback(base, "invalid_output");
}

function fallback(base: SearchResponse, fallbackReason: NonNullable<SearchResponse["curation"]["fallbackReason"]>): SearchResponse {
  return { ...base, curation: { source: "deterministic", fallbackReason } };
}
