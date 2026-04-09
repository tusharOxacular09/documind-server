import { env } from "../../../config/env";
import type { CitationDto } from "./retrieval.service";
import { MAX_CHUNKS_FOR_LLM } from "./rag-constants";

const OPENAI_API = "https://api.openai.com/v1";
/** Chat completions: fixed to cheapest model per product requirement. */
const CHAT_COMPLETION_MODEL = "gpt-4o-mini";
const OPENAI_TIMEOUT_MS = 5000;

const hasOpenAI = (): boolean => Boolean(env.openaiApiKey.trim());

type OpenAICallOpts = {
  /** Logged as `OpenAI used for: …` */
  usageFor: string;
};

const postOpenAI = async <T>(path: string, body: unknown, opts: OpenAICallOpts): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  console.log("OpenAI used for:", opts.usageFor);
  try {
    const res = await fetch(`${OPENAI_API}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.openaiApiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`OpenAI API error: ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
};

type EmbeddingResponse = {
  data: Array<{ embedding: number[] }>;
};

const createEmbedding = async (text: string, opts?: OpenAICallOpts): Promise<number[] | null> => {
  if (!hasOpenAI()) return null;
  const input = text.trim();
  if (!input) return null;

  try {
    const response = await postOpenAI<EmbeddingResponse>(
      "/embeddings",
      {
        model: env.openaiEmbeddingModel,
        input,
      },
      { usageFor: opts?.usageFor ?? "embedding" }
    );
    return response.data[0]?.embedding ?? null;
  } catch {
    return null;
  }
};

type ChatCompletionResponse = {
  choices: Array<{ message: { content?: string | null } }>;
};

/**
 * Single chat completion for grounded answer. Call at most once per HTTP request when OpenAI is enabled.
 * Citations should already be truncated for prompt size.
 */
const generateGroundedAnswer = async (
  question: string,
  citations: CitationDto[],
  opts?: OpenAICallOpts
): Promise<string | null> => {
  if (!hasOpenAI() || citations.length === 0) return null;

  const top = citations.slice(0, MAX_CHUNKS_FOR_LLM);
  const context = top.map((c, i) => `[${i + 1}] ${c.documentName}: ${c.snippet}`).join("\n");

  const system = "Answer only from the numbered sources. If unclear, say you lack evidence. Be brief (2–4 sentences).";
  const user = `Q: ${question}\nSources:\n${context}`;

  try {
    const response = await postOpenAI<ChatCompletionResponse>(
      "/chat/completions",
      {
        model: CHAT_COMPLETION_MODEL,
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      },
      { usageFor: opts?.usageFor ?? "chat/grounded-answer" }
    );
    const content = response.choices[0]?.message?.content?.trim();
    return content || null;
  } catch {
    return null;
  }
};

export { createEmbedding, generateGroundedAnswer, hasOpenAI };
