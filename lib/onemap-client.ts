/** Server-only OneMap client. Credentials and tokens never enter browser responses. */
const origin = "https://www.onemap.gov.sg";
export class MapProviderError extends Error {
  constructor(readonly provider: string, readonly status: number | null, message?: string) {
    super(message ?? `${provider} ${status === 504 || status === null ? "timed out" : `is unavailable (HTTP ${status})`}. Retry this lookup or open Google Maps.`);
  }
}
type Credentials = { email?: string; password?: string; token?: string };
type Options = { credentials?: () => Credentials; fetch?: typeof fetch; now?: () => number; wait?: (ms: number) => Promise<void> };
export class OneMapClient {
  private token?: { value: string; expires: number };
  private signingIn?: Promise<string>;
  private authRetryAt = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private nextAt = 0;
  private cache = new Map<string, { value: unknown; checkedAt: string; expires: number }>();
  private pending = new Map<string, Promise<unknown>>();
  private now: () => number;
  private wait: (ms: number) => Promise<void>;
  private fetcher: typeof fetch;
  private credentials: () => Credentials;
  constructor(options: Options = {}) {
    this.now = options.now ?? Date.now;
    this.wait = options.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
    this.fetcher = options.fetch ?? ((...args) => fetch(...args));
    this.credentials = options.credentials ?? (() => ({ email: process.env.ONEMAP_EMAIL, password: process.env.ONEMAP_PASSWORD, token: process.env.ONEMAP_ACCESS_TOKEN }));
  }
  private async json(path: string, init: RequestInit, provider: string) {
    let response: Response;
    try {
      response = await this.fetcher(origin + path, { ...init, redirect: "error", signal: AbortSignal.timeout(18000) });
    } catch { throw new MapProviderError(provider, null); }
    const text = await response.text();
    if (text.length > 5000000) throw new MapProviderError(provider, 502, `${provider} returned an oversized response.`);
    let value: unknown;
    try { value = JSON.parse(text); } catch { if (response.ok) throw new MapProviderError(provider, 502); value = null; }
    return { response, value };
  }
  private async accessToken(force = false): Promise<string> {
    const creds = this.credentials();
    if (!force && this.token && this.token.expires > this.now() + 60000) return this.token.value;
    if (this.signingIn) return this.signingIn;
    if ((!creds.email || !creds.password) && creds.token && !force) return creds.token;
    if (!creds.email || !creds.password) throw new MapProviderError("OneMap", 401, "OneMap is not configured or its token has expired. The site owner needs to configure OneMap credentials. You can still open Google Maps.");
    if (this.now() < this.authRetryAt) throw new MapProviderError("OneMap authentication", 401, "OneMap sign-in is unavailable. The site owner should check the verified account credentials; retry in a minute.");
    this.signingIn = (async () => {
      try {
        const { response, value } = await this.json("/api/auth/post/getToken", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: creds.email!.trim(), password: creds.password }) }, "OneMap authentication");
        const data = value as { access_token?: unknown; expiry_timestamp?: unknown };
        const expires = Number(data?.expiry_timestamp) * 1000;
        if (!response.ok || typeof data?.access_token !== "string" || !Number.isFinite(expires) || expires < this.now() + 60000)
          throw new MapProviderError("OneMap authentication", 401, "OneMap sign-in failed. The site owner should verify the account email and local credentials.");
        this.token = { value: data.access_token, expires };
        return data.access_token;
      } catch (e) { this.authRetryAt = this.now() + 60000; throw e; }
      finally { this.signingIn = undefined; }
    })();
    return this.signingIn;
  }
  async get<T>(path: string, params: Record<string, string>, parse: (raw: unknown) => T, ttl = 3600000, provider = "OneMap") : Promise<{ value: T; checkedAt: string }> {
    // Only known official APIs; never forward an account token to a supplied URL.
    if (!/^\/api\/(common\/elastic\/search|public\/(routingsvc\/route|nearbysvc\/getNearest(?:Mrt|Bus)Stops|themesvc\/(?:getAllThemesInfo|retrieveTheme)))$/.test(path)) throw new Error("Unsupported OneMap endpoint");
    const key = path + "?" + new URLSearchParams(params);
    const hit = this.cache.get(key);
    if (hit && hit.expires > this.now()) return { value: hit.value as T, checkedAt: hit.checkedAt };
    if (this.pending.has(key)) return this.pending.get(key) as Promise<{value:T;checkedAt:string}>;
    const task = this.queue.catch(() => {}).then(async () => {
      let token = await this.accessToken(), refreshed = false, retried = false;
      for (;;) {
        await this.wait(Math.max(0, this.nextAt - this.now())); this.nextAt = this.now() + 1100;
        const { response, value } = await this.json(key, { headers: { Authorization: token } }, provider);
        const error = value && typeof value === "object" ? (value as { error?: unknown; message?: unknown }).error ?? (value as { message?: unknown }).message : null;
        // OneMap Search can report authentication failure in an HTTP 200 envelope.
        const authError = response.status === 401 || (typeof error === "string" && /token|unauthori[sz]ed|authentication/i.test(error));
        if (authError && !refreshed) { token = await this.accessToken(true); refreshed = true; continue; }
        if ([502,503,504].includes(response.status) && !retried) { retried = true; await this.wait(1500); continue; }
        if (!response.ok || authError) throw new MapProviderError(provider, authError ? 401 : response.status);
        if (error) throw new MapProviderError(provider, 502, `${provider} could not complete this lookup. No verified result is available; try another location or retry later.`);
        let parsed: T;
        try { parsed = parse(value); } catch { throw new MapProviderError(provider, 502, `${provider} returned an incomplete result. No location or travel time was invented.`); }
        const checkedAt = new Date(this.now()).toISOString();
        if (this.cache.size >= 1000) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, { value: parsed, checkedAt, expires: this.now() + ttl });
        return { value: parsed, checkedAt };
      }
    }).finally(() => this.pending.delete(key));
    this.queue = task; this.pending.set(key, task); return task;
  }
}
export const oneMap = new OneMapClient();
