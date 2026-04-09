import { Types } from "mongoose";

import { DocumentChunkModel } from "../../document/document-chunk.model";
import { DocumentModel } from "../../document/document.model";
import { MAX_CHUNKS_FOR_LLM, MAX_CHUNKS_TO_RANK } from "./rag-constants";

export type CitationDto = {
  documentId?: string;
  documentName: string;
  snippet: string;
};

const tokenize = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2)
  );

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const SNIPPET_DISPLAY_CHARS = 220;

/**
 * Lexical-only retrieval (no OpenAI on the chat path) — keeps one completion budget free for generateGroundedAnswer.
 */
const retrieveRankedCitations = async (
  ownerId: Types.ObjectId,
  message: string,
  selectedDocumentIds: string[]
): Promise<CitationDto[]> => {
  const documentFilter = selectedDocumentIds.length
    ? { _id: { $in: selectedDocumentIds.map((id) => new Types.ObjectId(id)) }, userId: ownerId }
    : { userId: ownerId };

  const readyDocs = await DocumentModel.find({ ...documentFilter, status: "ready" }).select("_id name type").lean();
  const readyDocIds = readyDocs.map((doc) => doc._id);

  const chunkFilter = readyDocIds.length ? { userId: ownerId, documentId: { $in: readyDocIds } } : { userId: ownerId };
  const candidateChunks = await DocumentChunkModel.find(chunkFilter)
    .select("content documentId")
    .limit(MAX_CHUNKS_TO_RANK)
    .lean();

  const queryTokens = tokenize(message);
  const docMap = new Map(readyDocs.map((doc) => [doc._id.toString(), doc]));

  const ranked = candidateChunks
    .map((chunk) => {
      const lexical = [...tokenize(chunk.content)].reduce((acc, token) => (queryTokens.has(token) ? acc + 1 : acc), 0);
      return { chunk, score: lexical };
    })
    .filter((item) => item.score > 0 || queryTokens.size === 0)
    .sort((a, b) => b.score - a.score);

  // One citation per document (best-scoring chunk) so the UI does not list the same PDF twice.
  const citations: CitationDto[] = [];
  const seenDocumentIds = new Set<string>();
  for (const item of ranked) {
    if (citations.length >= MAX_CHUNKS_FOR_LLM) break;

    const docId = item.chunk.documentId.toString();
    if (seenDocumentIds.has(docId)) continue;

    const doc = docMap.get(docId);
    if (!doc) continue;

    const raw = item.chunk.content.trim();
    const snippet =
      raw.length > SNIPPET_DISPLAY_CHARS ? `${raw.slice(0, SNIPPET_DISPLAY_CHARS)}…` : raw;

    if (queryTokens.size > 0) {
      const tokenRegex = new RegExp(
        [...queryTokens].map((token) => `\\b${escapeRegExp(token)}\\b`).join("|"),
        "i"
      );
      if (!tokenRegex.test(snippet) && citations.length > 0) continue;
    }

    seenDocumentIds.add(docId);
    citations.push({
      documentId: doc._id.toString(),
      documentName: doc.name,
      snippet,
    });
  }

  return citations;
};

export { retrieveRankedCitations };
