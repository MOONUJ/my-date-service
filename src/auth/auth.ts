const PASSWORD_ITERATIONS = 600_000;
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;
const SESSION_COOKIE = "date_mate_session";
const encoder = new TextEncoder();

export interface AuthUser {
  id: string;
  email: string;
}

interface UserRow extends AuthUser {
  password_hash: string;
  password_salt: string;
  password_iterations: number;
}

interface SessionUserRow extends AuthUser {
  expires_at: string;
}

export type AuthValidationResult =
  | { ok: true; email: string; password: string }
  | { ok: false; code: "INVALID_EMAIL" | "INVALID_PASSWORD" };

export type AccountDeletionValidationResult =
  | { ok: true; password: string }
  | { ok: false; code: "INVALID_PASSWORD" | "INVALID_CONFIRMATION" };

export function validateCredentials(value: unknown): AuthValidationResult {
  if (!isRecord(value)) return { ok: false, code: "INVALID_EMAIL" };
  const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
  const password = typeof value.password === "string" ? value.password : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, code: "INVALID_EMAIL" };
  }
  if (password.length < 12 || password.length > 128) return { ok: false, code: "INVALID_PASSWORD" };
  return { ok: true, email, password };
}

export function validateAccountDeletion(value: unknown): AccountDeletionValidationResult {
  if (!isRecord(value) || value.confirmation !== "계정 삭제") return { ok: false, code: "INVALID_CONFIRMATION" };
  const password = typeof value.password === "string" ? value.password : "";
  return password.length >= 12 && password.length <= 128
    ? { ok: true, password }
    : { ok: false, code: "INVALID_PASSWORD" };
}

export async function createUser(db: D1Database, email: string, password: string, now = new Date()): Promise<AuthUser> {
  const id = crypto.randomUUID();
  const salt = randomBytes(16);
  const passwordHash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  await db
    .prepare(
      "INSERT INTO users (id, email, password_hash, password_salt, password_iterations, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(id, email, toBase64(passwordHash), toBase64(salt), PASSWORD_ITERATIONS, now.toISOString())
    .run();
  return { id, email };
}

export async function verifyCredentials(db: D1Database, email: string, password: string): Promise<AuthUser | null> {
  const row = await db
    .prepare("SELECT id, email, password_hash, password_salt, password_iterations FROM users WHERE email = ? LIMIT 1")
    .bind(email)
    .first<UserRow>();
  if (!row) {
    await derivePassword(password, new Uint8Array(16), PASSWORD_ITERATIONS);
    return null;
  }
  const actual = await derivePassword(password, fromBase64(row.password_salt), row.password_iterations);
  const expected = fromBase64(row.password_hash);
  return constantTimeEqual(actual, expected)
    ? { id: row.id, email: row.email }
    : null;
}

export async function verifyUserPassword(db: D1Database, userId: string, password: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT id, email, password_hash, password_salt, password_iterations FROM users WHERE id = ? LIMIT 1")
    .bind(userId)
    .first<UserRow>();
  if (!row) return false;
  const actual = await derivePassword(password, fromBase64(row.password_salt), row.password_iterations);
  const expected = fromBase64(row.password_hash);
  return constantTimeEqual(actual, expected);
}

export async function deleteAccount(db: D1Database, userId: string): Promise<boolean> {
  const deleted = await db.prepare("DELETE FROM users WHERE id = ? RETURNING id").bind(userId).first<{ id: string }>();
  return deleted?.id === userId;
}

export async function createSession(db: D1Database, userId: string, now = new Date()): Promise<string> {
  const token = toBase64Url(randomBytes(32));
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
  await db
    .prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(tokenHash, userId, expiresAt.toISOString(), now.toISOString())
    .run();
  await cleanupExpiredSessions(db, now);
  return serializeSessionCookie(token, expiresAt);
}

export async function getSessionUser(db: D1Database, request: Request, now = new Date()): Promise<AuthUser | null> {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (!token) return null;
  const row = await db
    .prepare(
      "SELECT users.id, users.email, sessions.expires_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? LIMIT 1",
    )
    .bind(await hashToken(token))
    .first<SessionUserRow>();
  if (!row) return null;
  if (Date.parse(row.expires_at) <= now.getTime()) {
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hashToken(token)).run();
    return null;
  }
  return { id: row.id, email: row.email };
}

export async function cleanupExpiredSessions(db: D1Database, now = new Date()): Promise<void> {
  await db
    .prepare("DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE expires_at <= ? ORDER BY expires_at LIMIT 20)")
    .bind(now.toISOString())
    .run();
}

export async function revokeSession(db: D1Database, request: Request): Promise<void> {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (token) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hashToken(token)).run();
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function serializeSessionCookie(token: string, expiresAt: Date): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return toBase64Url(new Uint8Array(digest));
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function constantTimeEqual(actual: Uint8Array, expected: Uint8Array): boolean {
  if (actual.byteLength !== expected.byteLength) return false;
  const timingSafeEqual = crypto.subtle.timingSafeEqual?.bind(crypto.subtle);
  if (timingSafeEqual) return timingSafeEqual(actual, expected);
  let difference = 0;
  for (let index = 0; index < actual.byteLength; index += 1) {
    difference |= actual[index]! ^ expected[index]!;
  }
  return difference === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
