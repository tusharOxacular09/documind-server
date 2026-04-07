import { Types } from "mongoose";

import { DocumentChunkModel } from "../../document/document-chunk.model";
import { DocumentModel } from "../../document/document.model";

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

/**
 * Multi-step retrieval: scope to user → load ready documents → fetch chunks → rank by lexical overlap → fuse by document.
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
  const candidateChunks = await DocumentChunkModel.find(chunkFilter).select("content documentId").lean();

  const queryTokens = tokenize(message);
  const rankedChunks = candidateChunks
    .map((chunk) => ({
      chunk,
      score: [...tokenize(chunk.content)].reduce((acc, token) => (queryTokens.has(token) ? acc + 1 : acc), 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const docMap = new Map(readyDocs.map((doc) => [doc._id.toString(), doc]));
  const grouped = new Map<string, { score: number; snippet: string }>();
  for (const item of rankedChunks) {
    const docId = item.chunk.documentId.toString();
    const existing = grouped.get(docId);
    const snippet = item.chunk.content.slice(0, 180);
    if (!existing || item.score > existing.score) {
      grouped.set(docId, { score: item.score, snippet });
    }
  }

  const citationScores: { score: number; citation: CitationDto }[] = [];
  for (const [docId, data] of grouped.entries()) {
    const doc = docMap.get(docId);
    if (!doc) continue;
    citationScores.push({
      score: data.score,
      citation: {
        documentId: docId,
        documentName: doc.name,
        snippet: data.snippet,
      },
    });
  }

  return citationScores
    .sort((a, b) => b.score - a.score || a.citation.documentName.localeCompare(b.citation.documentName))
    .map((entry) => entry.citation)
    .filter((_, idx) => idx < 2)
    .slice(0, 2)
    .filter((citation, idx) => {
      if (queryTokens.size === 0) return idx === 0;
      const tokenRegex = new RegExp(
        [...queryTokens].map((token) => `\\b${escapeRegExp(token)}\\b`).join("|"),
        "i"
      );
      return tokenRegex.test(citation.snippet) || idx === 0;
    });
};

export { retrieveRankedCitations };
