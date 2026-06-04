import { SWAPCARD_ENDPOINTS } from "./endpoints.js";

export interface GraphQLError {
  message: string;
  path?: (string | number)[];
  extensions?: Record<string, unknown>;
}

export interface RateLimitInfo {
  limit?: number;
  used?: number;
  remaining?: number;
  cost?: number;
  reset?: number;
}

export class SwapcardError extends Error {
  constructor(
    message: string,
    public details?: { status?: number; errors?: GraphQLError[]; rateLimit?: RateLimitInfo },
  ) {
    super(message);
    this.name = "SwapcardError";
  }
}

function parseRateLimit(h: Headers): RateLimitInfo {
  const num = (k: string) => {
    const v = h.get(k);
    return v == null ? undefined : Number(v);
  };
  return {
    limit: num("X-RateLimit-Limit"),
    used: num("X-RateLimit-Used"),
    remaining: num("X-RateLimit-Remaining"),
    cost: num("X-RateLimit-Cost"),
    reset: num("X-RateLimit-Reset"),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt: number) => Math.min(8000, 250 * 2 ** (attempt - 1));

/**
 * Execute a GraphQL operation against a Swapcard endpoint using the given per-request API key.
 * Retries transient 429/5xx responses with exponential backoff; maps GraphQL/HTTP errors to SwapcardError.
 */
export async function swapcardGraphQL<T = unknown>(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>,
  opts?: { endpoint?: string; signal?: AbortSignal },
): Promise<{ data: T; rateLimit: RateLimitInfo }> {
  const endpoint = opts?.endpoint ?? SWAPCARD_ENDPOINTS.eventAdmin;
  const maxAttempts = 4;

  for (let attempt = 1; ; attempt++) {
    let resp: Response;
    try {
      resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: apiKey,
          "Content-Type": "application/json",
          "User-Agent": "swapcard-mcp/0.1",
        },
        body: JSON.stringify({ query, variables: variables ?? {} }),
        signal: opts?.signal,
      });
    } catch (e) {
      if (attempt < maxAttempts) {
        await sleep(backoff(attempt));
        continue;
      }
      throw new SwapcardError(`Network error calling Swapcard: ${(e as Error).message}`);
    }

    const rateLimit = parseRateLimit(resp.headers);

    if ((resp.status === 429 || resp.status >= 500) && attempt < maxAttempts) {
      const retryAfter = Number(resp.headers.get("Retry-After"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
      continue;
    }

    const text = await resp.text();
    let body: { data?: T; errors?: GraphQLError[] };
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new SwapcardError(
        `Swapcard returned non-JSON (HTTP ${resp.status}): ${text.slice(0, 300)}`,
        { status: resp.status, rateLimit },
      );
    }

    if (resp.status === 401 || resp.status === 403) {
      throw new SwapcardError(
        `Authentication failed (HTTP ${resp.status}). Check the Swapcard API key.`,
        { status: resp.status, rateLimit },
      );
    }
    if (body.errors?.length) {
      throw new SwapcardError(body.errors.map((e) => e.message).join("; "), {
        status: resp.status,
        errors: body.errors,
        rateLimit,
      });
    }
    if (!resp.ok) {
      throw new SwapcardError(`Swapcard HTTP ${resp.status}: ${text.slice(0, 300)}`, {
        status: resp.status,
        rateLimit,
      });
    }

    return { data: body.data as T, rateLimit };
  }
}
