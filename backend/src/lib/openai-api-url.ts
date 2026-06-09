/**
 * Join OpenAI-compatible API paths without duplicating slashes.
 * BASE_URL is whatever the provider documents — we never auto-append /v1 or /v2.
 */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

export function joinApiPath(baseUrl: string, ...segments: string[]): string {
  const base = normalizeBaseUrl(baseUrl);
  const path = segments
    .map((segment) => segment.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
  return path ? `${base}/${path}` : base;
}

const DEFAULT_CHAT_COMPLETIONS_PATH = "chat/completions";

export function resolveChatCompletionsUrl(
  baseUrl: string,
  completionsPath = process.env.OPENAI_LLM_COMPLETIONS_PATH?.trim() ||
    DEFAULT_CHAT_COMPLETIONS_PATH
): string {
  return joinApiPath(baseUrl, completionsPath);
}
