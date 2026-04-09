/** Max chunks passed into the chat completion (not document count). */
export const MAX_CHUNKS_FOR_LLM = 5;

/** When multiple documents are in scope, cap chunks per document so sources stay diverse. */
export const MAX_CHUNKS_PER_DOCUMENT_MULTI = 3;

/** Target characters per chunk in the LLM prompt (middle of 300–500). */
export const MAX_CHUNK_CHARS_FOR_PROMPT = 450;

/** Snippet length stored on citations / ranking (full chunk can be larger). */
export const SNIPPET_DISPLAY_CHARS = 450;

/** Rough cap on candidate chunks loaded for ranking (limits DB read). */
export const MAX_CHUNKS_TO_RANK = 400;

/** Include chunk on embedding similarity alone above this cosine threshold. */
export const MIN_COSINE_TO_RETRIEVE = 0.22;
