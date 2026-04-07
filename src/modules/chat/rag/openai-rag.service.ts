import { env } from "../../../config/env";
import type { CitationDto } from "./retrieval.service";

const OPENAI_API = "https://api.openai.com/v1";

const hasOpenAI = (): boolean => Boolean(env.openaiApiKey);

const postOpenAI = async <T>(path: string, body: unknown): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
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

const createEmbedding = async (text: string): Promise<number[] | null> => {
  if (!hasOpenAI()) return null;
  const input = text.trim();
  if (!input) return null;

  try {
    const response = await postOpenAI<EmbeddingResponse>("/embeddings", {
      model: env.openaiEmbeddingModel,
      input,
    });
    return response.data[0]?.embedding ?? null;
  } catch {
    return null;
  }
};

type ChatCompletionResponse = {
  choices: Array<{ message: { content?: string | null } }>;
};

const generateGroundedAnswer = async (question: string, citations: CitationDto[]): Promise<string | null> => {
  if (!hasOpenAI() || citations.length === 0) return null;

  const context = citations
    .map((c, i) => `Source ${i + 1} - ${c.documentName}:\n${c.snippet}`)
    .join("\n\n");

  const system =
    "You are a document QA assistant. Answer ONLY from provided sources. If evidence is insufficient, say so clearly. Keep response concise and factual.";
  const user = `Question:\n${question}\n\nSources:\n${context}\n\nProvide a grounded answer in 3-6 sentences.`;

  try {
    const response = await postOpenAI<ChatCompletionResponse>("/chat/completions", {
      model: env.openaiChatModel,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const content = response.choices[0]?.message?.content?.trim();
    return content || null;
  } catch {
    return null;
  }
};

export { createEmbedding, generateGroundedAnswer, hasOpenAI };
