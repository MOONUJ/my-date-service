CREATE TABLE request_rate_limits (
  scope TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  user_id TEXT,
  request_count INTEGER NOT NULL CHECK (request_count >= 1),
  window_expires_at INTEGER NOT NULL,
  PRIMARY KEY (scope, key_hash),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX request_rate_limits_expires_at_idx ON request_rate_limits(window_expires_at);
CREATE INDEX request_rate_limits_user_id_idx ON request_rate_limits(user_id);
