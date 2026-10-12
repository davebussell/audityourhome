/**
 * Supabase client and the account actions the site uses. Loaded only on
 * account pages, or on demand (dynamic import) when someone submits a form.
 */
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS, ACCOUNTS_ENABLED } from '../../config/site';

let client: SupabaseClient | null = null;

export function sb(): SupabaseClient {
  if (!ACCOUNTS_ENABLED) throw new Error('Accounts are not switched on yet.');
  if (!client) {
    client = createClient(ACCOUNTS.supabaseUrl, ACCOUNTS.supabaseKey, {
      auth: {
        // Implicit flow: the sign-in link works even when it's opened on a
        // different device from the one that asked for it.
        flowType: 'implicit',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

export type PendingKind = 'match' | 'plan' | 'alerts';
export type Pending = { kind: PendingKind; payload: Record<string, unknown> };

const CLAIM_STORE = 'ayh-claim';

function uuid(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function rememberClaim(key: string, email: string) {
  try { localStorage.setItem(CLAIM_STORE, JSON.stringify({ key, email, at: Date.now() })); } catch { /* private mode */ }
}
export function storedClaim(): { key: string; email: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(CLAIM_STORE) ?? 'null');
    if (v && typeof v.key === 'string' && Date.now() - (v.at ?? 0) < 7 * 86400000) return v;
  } catch { /* ignore */ }
  return null;
}
export function forgetClaim() {
  try { localStorage.removeItem(CLAIM_STORE); } catch { /* ignore */ }
}

/** Friendlier wording for the errors people actually hit. */
export function friendlyError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e ?? '');
  if (/only request this after|rate limit|too many|over_email_send_rate_limit|429/i.test(msg)) return 'Please wait a minute before asking for another code.';
  if (/expired|invalid.*(otp|token)|token.*invalid|otp_expired/i.test(msg)) return 'That code didn’t work. Check the numbers, or ask for a new code.';
  if (/not authorized|email address not authorized/i.test(msg)) return 'We can’t send email to that address yet. Please try again later or email us.';
  if (/invalid.*email|valid email|email.*invalid/i.test(msg)) return 'Please enter a valid email address.';
  if (/failed to fetch|network|load failed/i.test(msg)) return 'We couldn’t reach the server. Check your connection and try again.';
  if (/JWT|not signed in|sign in first|42501/i.test(msg)) return 'Please sign in again.';
  return msg.length < 200 && msg ? msg : 'Something went wrong. Please try again.';
}

/**
 * Hold any requests until the email is confirmed, then email a sign-in code
 * and link. Returns the claim key that releases the held requests.
 */
export async function startSignIn(email: string, pending: Pending[] = [], next = ''): Promise<string> {
  const key = uuid();
  const addr = email.trim().toLowerCase();
  for (const p of pending) {
    const { error } = await sb().rpc('queue_pending', { p_email: addr, p_kind: p.kind, p_payload: p.payload, p_claim_key: key });
    if (error) throw error;
  }
  rememberClaim(key, addr);
  const redirect = new URL('/account/', location.origin);
  redirect.searchParams.set('claim', key);
  if (next) redirect.searchParams.set('next', next);
  const { error } = await sb().auth.signInWithOtp({
    email: addr,
    options: { emailRedirectTo: redirect.toString(), shouldCreateUser: true },
  });
  if (error) throw error;
  return key;
}

export async function verifyCode(email: string, code: string): Promise<Session> {
  const token = code.replace(/\D/g, '');
  const { data, error } = await sb().auth.verifyOtp({ email: email.trim().toLowerCase(), token, type: 'email' });
  if (error) throw error;
  if (!data.session) throw new Error('That code didn’t work. Ask for a new code.');
  return data.session;
}

export type ClaimResult = { match: number; plan: number; alerts: number; errors: number; match_ids?: string[] };

export async function claim(key: string | null | undefined): Promise<ClaimResult | null> {
  if (!key) return null;
  const { data, error } = await sb().rpc('claim_pending', { p_claim_key: key });
  if (error) throw error;
  forgetClaim();
  return data as ClaimResult;
}

/** For someone already signed in: hold and release requests in one go (no code needed). */
export async function queueAndClaim(email: string, pending: Pending[]): Promise<ClaimResult | null> {
  const key = uuid();
  for (const p of pending) {
    const { error } = await sb().rpc('queue_pending', { p_email: email.trim().toLowerCase(), p_kind: p.kind, p_payload: p.payload, p_claim_key: key });
    if (error) throw error;
  }
  return claim(key);
}

/** The signed-in person's email, if this browser holds a valid session. */
export async function signedInEmail(): Promise<string | null> {
  if (!looksSignedIn()) return null;
  try {
    const { data } = await sb().auth.getSession();
    return data.session?.user?.email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export async function session(): Promise<Session | null> {
  const { data } = await sb().auth.getSession();
  return data.session;
}

export async function signOut() {
  await sb().auth.signOut();
}

/** True when this browser holds a saved sign-in (cheap check for headers and forms). */
export function looksSignedIn(): boolean {
  try {
    return Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k));
  } catch {
    return false;
  }
}

export async function rpc<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb().rpc(name, args);
  if (error) throw error;
  return data as T;
}
