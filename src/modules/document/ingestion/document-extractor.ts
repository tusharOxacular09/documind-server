import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";

type SupportedDocumentType = "pdf" | "docx" | "ppt" | "pptx";

type ExtractInput = {
  name: string;
  type: SupportedDocumentType;
  storagePath?: string;
  sizeBytes: number;
};

const MIN_USEFUL_LENGTH = 40;

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const extractReadableTextFromBinary = (buffer: Buffer): string => {
  const utf8 = buffer.toString("utf8");
  const stripped = utf8.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ");
  return normalizeWhitespace(stripped);
};

const fallbackText = (input: ExtractInput): string =>
  [
    `Document "${input.name}" (${input.type.toUpperCase()}) was uploaded successfully.`,
    `File size is ${input.sizeBytes} bytes.`,
    "Full text could not be extracted from this file; heuristic fallback is used for retrieval.",
    "This content remains usable for chunk retrieval and grounding.",
  ].join(" ");

const extractPdf = async (buffer: Buffer): Promise<string> => {
  const data = await pdfParse(buffer);
  return normalizeWhitespace(data.text ?? "");
};

const extractDocx = async (buffer: Buffer): Promise<string> => {
  const result = await mammoth.extractRawText({ buffer });
  return normalizeWhitespace(result.value ?? "");
};

const extractPptxText = async (buffer: Buffer): Promise<string> => {
  const zip = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const na = Number(/slide(\d+)/i.exec(a)?.[1] ?? 0);
      const nb = Number(/slide(\d+)/i.exec(b)?.[1] ?? 0);
      return na - nb;
    });

  const slideTexts: string[] = [];
  for (const name of slideNames) {
    const entry = zip.file(name);
    if (!entry) continue;
    const xml = await entry.async("string");
    const fromAT = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/gi)].map((m) => m[1].trim()).filter(Boolean);
    if (fromAT.length > 0) {
      slideTexts.push(fromAT.join(" "));
      continue;
    }
    const fromWT = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/gi)].map((m) => m[1].trim()).filter(Boolean);
    if (fromWT.length > 0) slideTexts.push(fromWT.join(" "));
  }

  return normalizeWhitespace(slideTexts.join("\n\n"));
};

const extractByType = async (buffer: Buffer, type: SupportedDocumentType): Promise<string> => {
  if (type === "pdf") {
    return extractPdf(buffer);
  }
  if (type === "docx") {
    return extractDocx(buffer);
  }
  if (type === "pptx" || type === "ppt") {
    return extractPptxText(buffer);
  }
  return "";
};

const extractDocumentText = async (input: ExtractInput): Promise<string> => {
  if (!input.storagePath) {
    return fallbackText(input);
  }

  try {
    const buffer = await readFile(input.storagePath);

    try {
      const typed = await extractByType(buffer, input.type);
      if (typed.length >= MIN_USEFUL_LENGTH) {
        return typed;
      }
    } catch {
      /* fall through to heuristic / fallback */
    }

    const heuristic = extractReadableTextFromBinary(buffer);
    if (heuristic.length >= MIN_USEFUL_LENGTH) {
      return heuristic;
    }

    return fallbackText(input);
  } catch {
    return fallbackText(input);
  }
};

export { extractDocumentText };
