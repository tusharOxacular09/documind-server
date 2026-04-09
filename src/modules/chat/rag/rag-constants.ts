/** Max chunks passed into the chat completion (not document count). */
export const MAX_CHUNKS_FOR_LLM = 5;

/** Target characters per chunk in the LLM prompt (middle of 300–500). */
export const MAX_CHUNK_CHARS_FOR_PROMPT = 400;

/** Rough cap on candidate chunks loaded for ranking (limits DB read). */
export const MAX_CHUNKS_TO_RANK = 400;
