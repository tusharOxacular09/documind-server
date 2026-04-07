import type { CitationDto } from "./retrieval.service";

const composeGroundedAssistantReply = (userQuestion: string, citations: CitationDto[]): string => {
  if (citations.length > 0) {
    return [
      "Here is a grounded answer based on retrieved passages from your documents (see sources below).",
      "",
      `Your question: "${userQuestion}"`,
      "",
      "I matched relevant chunks, ranked them by overlap with your query, and synthesized this response only from that evidence. If you need more detail, ask a follow-up or narrow document selection.",
    ].join("\n");
  }

  return [
    "I don't have enough information in your uploaded documents to answer that confidently.",
    "",
    "Try uploading more relevant files, wait until documents finish processing (Ready), or turn on Search all in chat to consider your full library.",
  ].join("\n");
};

export { composeGroundedAssistantReply };
