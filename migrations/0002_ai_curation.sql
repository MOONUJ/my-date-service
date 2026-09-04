CREATE TABLE ai_curation_cache (
  user_id TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (user_id, cache_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX ai_curation_cache_expires_at_idx ON ai_curation_cache(expires_at);

CREATE TABLE ai_usage_daily (
  user_id TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  call_count INTEGER NOT NULL DEFAULT 0 CHECK (call_count >= 0 AND call_count <= 30),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  PRIMARY KEY (user_id, usage_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE ai_usage_monthly (
  usage_month TEXT PRIMARY KEY,
  call_count INTEGER NOT NULL DEFAULT 0 CHECK (call_count >= 0 AND call_count <= 1000),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0)
);
