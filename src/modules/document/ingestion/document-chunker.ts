type ChunkInput = {
  text: string;
  chunkSize: number;
  overlap: number;
};

const chunkText = (input: ChunkInput): string[] => {
  const normalized = input.text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const words = normalized.split(" ");
  if (words.length <= input.chunkSize) return [normalized];

  const chunks: string[] = [];
  const step = Math.max(1, input.chunkSize - input.overlap);
  for (let i = 0; i < words.length; i += step) {
    const segment = words.slice(i, i + input.chunkSize).join(" ").trim();
    if (!segment) continue;
    chunks.push(segment);
    if (i + input.chunkSize >= words.length) break;
  }
  return chunks;
};

export { chunkText };
