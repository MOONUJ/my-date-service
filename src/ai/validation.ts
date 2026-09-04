import { AI_REASON_LIMIT, AI_RECOMMENDATION_LIMIT, type AiCandidate, type AiCuration, type AiRecommendation } from "./types";

export function buildVerifiedReason(evidence: readonly string[]): string {
  const values = evidence.slice(0, 2).map((value) => `“${value}”`).join(", ");
  return `${values} 정보가 저장한 취향에 잘 맞는 후보예요.`;
}

export function validateCuration(value: unknown, candidates: readonly AiCandidate[]): AiCuration | null {
  if (!isRecord(value) || !Array.isArray(value.recommendations)) return null;
  const expectedCount = Math.min(AI_RECOMMENDATION_LIMIT, candidates.length);
  if (value.recommendations.length !== expectedCount) return null;

  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const seen = new Set<string>();
  const recommendations: AiRecommendation[] = [];

  for (const item of value.recommendations) {
    if (!isRecord(item) || typeof item.place_id !== "string" || seen.has(item.place_id)) return null;
    const candidate = candidateById.get(item.place_id);
    if (!candidate || !Array.isArray(item.evidence) || item.evidence.length < 1 || item.evidence.length > 2) return null;
    if (!item.evidence.every((entry): entry is string => typeof entry === "string")) return null;
    const allowedEvidence = new Set([candidate.name, candidate.category, ...candidate.tags, ...(candidate.transportTip ? [candidate.transportTip] : [])]);
    if (new Set(item.evidence).size !== item.evidence.length || item.evidence.some((entry) => !allowedEvidence.has(entry))) return null;
    const reason = buildVerifiedReason(item.evidence);
    if (typeof item.reason !== "string" || item.reason !== reason || reason.length > AI_REASON_LIMIT) return null;
    seen.add(item.place_id);
    recommendations.push({ placeId: item.place_id, evidence: item.evidence, reason });
  }

  return { recommendations };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
