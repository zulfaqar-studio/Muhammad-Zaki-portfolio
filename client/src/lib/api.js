const RAW_API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");

const DEV_API_BASE = import.meta.env.DEV ? "/api" : "";
const API_BASE_URL = import.meta.env.DEV ? DEV_API_BASE : RAW_API_BASE_URL;

export const API_CONFIG = Object.freeze({
  baseUrl: API_BASE_URL,
  enabled: Boolean(API_BASE_URL)
});

function buildUrl(pathname) {
  const path = pathname.startsWith("/") ? pathname : "/" + pathname;
  return API_BASE_URL ? API_BASE_URL + path : path;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson(pathname, options = {}) {
  if (!API_BASE_URL) throw new Error("API base URL is not configured.");

  const {
    method = "GET",
    body,
    headers = {},
    timeoutMs = 7000,
    retries = 1,
    cache = "no-store"
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(buildUrl(pathname), {
        method,
        signal: controller.signal,
        cache,
        headers: {
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...headers
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });

      const payload = await response.json().catch(() => ({}));

      if (response.ok) return payload;

      const transient = response.status === 429 || response.status >= 500;
      const error = new Error(
        String(payload?.error || payload?.message || "API request failed (HTTP " + response.status + ").")
      );
      error.status = response.status;

      if (!transient || attempt === retries) throw error;
      lastError = error;
    } catch (error) {
      lastError = error?.name === "AbortError"
        ? new Error("API request timed out.")
        : error;

      if (attempt === retries) throw lastError;
    } finally {
      clearTimeout(timeout);
    }

    await sleep(250 * (attempt + 1));
  }

  throw lastError || new Error("API request failed.");
}

export function getApiUrl(pathname) {
  return buildUrl(pathname);
}
