import type { CitationDto } from "./retrieval.service";
import { generateGroundedAnswer, hasOpenAI } from "./openai-rag.service";
import { MAX_CHUNK_CHARS_FOR_PROMPT, MAX_CHUNKS_FOR_LLM } from "./rag-constants";

const truncateForPrompt = (snippet: string): string =>
  snippet.length > MAX_CHUNK_CHARS_FOR_PROMPT
    ? `${snippet.slice(0, MAX_CHUNK_CHARS_FOR_PROMPT)}…`
    : snippet;

const fallbackFromChunks = (question: string, citations: CitationDto[]): string => {
  if (citations.length === 0) {
    return [
      "I don't have enough information in your uploaded documents to answer that confidently.",
      "",
      "Try uploading more relevant files or wait until documents finish processing (Ready).",
    ].join("\n");
  }

  const lines = citations.slice(0, MAX_CHUNKS_FOR_LLM).map((c, i) => {
    const s = truncateForPrompt(c.snippet);
    return `${i + 1}. **${c.documentName}**: ${s}`;
  });

  return [
    "Based on available document content, here are the closest matching passages to your question.",
    "",
    `Your question: "${question}"`,
    "",
    ...lines,
    "",
    "Configure OPENAI_API_KEY for a synthesized summary; otherwise answers use retrieval only.",
  ].join("\n");
};

/**
 * At most one OpenAI call (chat completion) when the API key is set; otherwise template from chunks only.
 */
const composeGroundedAssistantReply = async (userQuestion: string, citations: CitationDto[]): Promise<string> => {
  const forLlm = citations.slice(0, MAX_CHUNKS_FOR_LLM).map((c) => ({
    ...c,
    snippet: truncateForPrompt(c.snippet),
  }));

  if (hasOpenAI() && forLlm.length > 0) {
    const generated = await generateGroundedAnswer(userQuestion, forLlm, { usageFor: "chat/ask" });
    if (generated) return generated;
  }

  return fallbackFromChunks(userQuestion, citations);
};

export { composeGroundedAssistantReply };
