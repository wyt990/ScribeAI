import { GoogleGenAI } from "@google/genai";
import { resolveChatCompletionsUrl } from "./openai-api-url";

export type SummaryProvider = "gemini" | "openai_compatible";

function getSummaryProvider(): SummaryProvider {
  const raw = (process.env.SUMMARY_PROVIDER || "gemini").toLowerCase();
  if (raw === "openai_compatible") return "openai_compatible";
  if (raw === "gemini") return "gemini";
  throw new Error(
    `Invalid SUMMARY_PROVIDER="${process.env.SUMMARY_PROVIDER}". Use "gemini" or "openai_compatible".`
  );
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function validateSummaryConfig(): void {
  const provider = getSummaryProvider();
  if (provider === "gemini") {
    requireEnv("GEMINI_API_KEY");
    return;
  }
  requireEnv("OPENAI_LLM_API_KEY");
  requireEnv("OPENAI_LLM_BASE_URL");
  requireEnv("OPENAI_LLM_MODEL");
}

async function generateWithGemini(prompt: string): Promise<string> {
  const apiKey = requireEnv("GEMINI_API_KEY");
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

  const genAI = new GoogleGenAI({ apiKey });
  const response = await genAI.models.generateContent({
    model,
    contents: prompt,
  });

  const text = response.text;
  if (!text?.trim()) {
    throw new Error("Gemini returned empty summary");
  }
  return text.trim();
}

export function getResolvedChatCompletionsUrl(): string {
  const baseUrl = requireEnv("OPENAI_LLM_BASE_URL");
  return resolveChatCompletionsUrl(baseUrl);
}

async function generateWithOpenAICompatible(prompt: string): Promise<string> {
  const apiKey = requireEnv("OPENAI_LLM_API_KEY");
  const model = requireEnv("OPENAI_LLM_MODEL");
  const completionsUrl = getResolvedChatCompletionsUrl();
  const maxTokens = Number(process.env.OPENAI_LLM_MAX_TOKENS || "4096");
  const temperature = Number(process.env.OPENAI_LLM_TEMPERATURE || "0.3");

  const response = await fetch(completionsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`LLM API error ${response.status}: ${errBody}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenAI-compatible LLM returned empty summary");
  }
  return text;
}

export async function generateSummary(prompt: string): Promise<string> {
  const provider = getSummaryProvider();
  if (provider === "openai_compatible") {
    return generateWithOpenAICompatible(prompt);
  }
  return generateWithGemini(prompt);
}

export function getSummaryProviderLabel(): string {
  return getSummaryProvider();
}
