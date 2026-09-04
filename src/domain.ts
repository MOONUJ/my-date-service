export type Transport = "car" | "transit";

export interface SearchRequest {
  query: string;
  transport: Transport;
  taste: string;
}

export interface PlaceRecommendation {
  id: string;
  rank: number;
  name: string;
  category: string;
  address: string;
  coordinates: { latitude: number; longitude: number };
  reason: string;
  transitTip: string | null;
  tags: string[];
}

export interface SearchResponse {
  query: string;
  generatedAt: string;
  source: string;
  curation: {
    source: "ai" | "cached" | "deterministic";
    fallbackReason?: "missing_key" | "budget_exhausted" | "timeout" | "rate_limited" | "provider_error" | "refused" | "invalid_output";
  };
  recommendations: PlaceRecommendation[];
  places: PlaceRecommendation[];
}

export interface ApiError {
  error: { code: string; message: string };
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface Preference {
  taste: string;
  updatedAt: string | null;
}

export interface SessionResponse {
  user: AuthUser | null;
  preference?: Preference;
  signupEnabled: boolean;
}

export interface AuthResponse {
  user: AuthUser;
  preference: Preference;
}
