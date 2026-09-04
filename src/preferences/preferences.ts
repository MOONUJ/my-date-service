export interface Preference {
  taste: string;
  updatedAt: string | null;
}

interface PreferenceRow {
  taste: string;
  updated_at: string;
}

export function validateTaste(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const taste = value.trim();
  return taste.length >= 2 && taste.length <= 500 ? taste : null;
}

export async function getPreference(db: D1Database, userId: string): Promise<Preference> {
  const row = await db
    .prepare("SELECT taste, updated_at FROM preferences WHERE user_id = ? LIMIT 1")
    .bind(userId)
    .first<PreferenceRow>();
  return row ? { taste: row.taste, updatedAt: row.updated_at } : { taste: "", updatedAt: null };
}

export async function savePreference(db: D1Database, userId: string, taste: string, now = new Date()): Promise<Preference> {
  const updatedAt = now.toISOString();
  await db
    .prepare(
      "INSERT INTO preferences (user_id, taste, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET taste = excluded.taste, updated_at = excluded.updated_at",
    )
    .bind(userId, taste, updatedAt)
    .run();
  return { taste, updatedAt };
}
