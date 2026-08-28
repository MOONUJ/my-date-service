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
  recommendations: PlaceRecommendation[];
  places: PlaceRecommendation[];
}

export interface ApiError {
  error: { code: string; message: string };
}
