import { Types } from "mongoose";

import { DocumentChunkModel } from "../../document/document-chunk.model";
import { DocumentModel } from "../../document/document.model";
import {
  MAX_CHUNKS_FOR_LLM,
  MAX_CHUNKS_PER_DOCUMENT_MULTI,
  MAX_CHUNKS_TO_RANK,
  MIN_COSINE_TO_RETRIEVE,
  SNIPPET_DISPLAY_CHARS,
} from "./rag-constants";
import type { CitationDto } from "./rag-types";
import { createEmbedding, hasOpenAI } from "./openai-rag.service";

export type { CitationDto };

const tokenize = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2)
  );

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
};

/**
 * Hybrid retrieval: cosine similarity on stored chunk embeddings when OpenAI is configured and
 * embeddings exist; otherwise lexical overlap. Multiple chunks from the same document are allowed
 * so single-PDF Q&A gets enough context (lists often span multiple chunks).
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
    .select("content documentId embedding")
    .sort({ documentId: 1, index: 1 })
    .limit(MAX_CHUNKS_TO_RANK)
    .lean();

  const queryTokens = tokenize(message);
  const docMap = new Map(readyDocs.map((doc) => [doc._id.toString(), doc]));

  const useEmbeddings =
    hasOpenAI() && candidateChunks.some((c) => Array.isArray(c.embedding) && c.embedding.length > 0);
  const queryEmbedding = useEmbeddings
    ? await createEmbedding(message, { usageFor: "chat/query-embedding" })
    : null;

  const maxPerDoc =
    readyDocIds.length <= 1 ? MAX_CHUNKS_FOR_LLM : MAX_CHUNKS_PER_DOCUMENT_MULTI;

  type Ranked = {
    chunk: (typeof candidateChunks)[0];
    lexical: number;
    embeddingSim: number;
    score: number;
  };

  const ranked: Ranked[] = candidateChunks
    .map((chunk) => {
      const lexical = [...tokenize(chunk.content)].reduce((acc, token) => (queryTokens.has(token) ? acc + 1 : acc), 0);
      const emb =
        queryEmbedding && Array.isArray(chunk.embedding) && chunk.embedding.length === queryEmbedding.length
          ? cosineSimilarity(queryEmbedding, chunk.embedding)
          : 0;
      const score = queryEmbedding ? emb * 1000 + lexical : lexical;
      return { chunk, lexical, embeddingSim: emb, score };
    })
    .filter((item) => {
      if (queryTokens.size === 0) {
        return queryEmbedding ? item.embeddingSim >= MIN_COSINE_TO_RETRIEVE : false;
      }
      return item.lexical > 0 || item.embeddingSim >= MIN_COSINE_TO_RETRIEVE;
    })
    .sort((a, b) => b.score - a.score);

  const citations: CitationDto[] = [];
  const perDocCount = new Map<string, number>();

  for (const item of ranked) {
    if (citations.length >= MAX_CHUNKS_FOR_LLM) break;

    const docId = item.chunk.documentId.toString();
    const prev = perDocCount.get(docId) ?? 0;
    if (prev >= maxPerDoc) continue;

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
      const lexicalOrStrongEmb =
        tokenRegex.test(snippet) || item.embeddingSim >= Math.max(MIN_COSINE_TO_RETRIEVE + 0.06, 0.3);
      if (!lexicalOrStrongEmb && citations.length > 0) continue;
    }

    perDocCount.set(docId, prev + 1);
    citations.push({
      documentId: doc._id.toString(),
      documentName: doc.name,
      snippet,
    });
  }

  return citations;
};

export { retrieveRankedCitations };
