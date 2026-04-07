import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
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

const execFileAsync = promisify(execFile);

const extractLegacyPptViaSoffice = async (inputPath: string): Promise<string> => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "documind-ppt-"));
  try {
    await execFileAsync("soffice", ["--headless", "--convert-to", "pptx", "--outdir", tmpDir, inputPath], {
      timeout: 15000,
    });
    const converted = path.join(tmpDir, `${path.parse(inputPath).name}.pptx`);
    const buffer = await readFile(converted);
    return extractPptxText(buffer);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
};

const extractByType = async (buffer: Buffer, type: SupportedDocumentType): Promise<string> => {
  if (type === "pdf") {
    return extractPdf(buffer);
  }
  if (type === "docx") {
    return extractDocx(buffer);
  }
  if (type === "pptx") {
    return extractPptxText(buffer);
  }
  if (type === "ppt") {
    return "";
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
      let typed = await extractByType(buffer, input.type);
      if (input.type === "ppt" && typed.length < MIN_USEFUL_LENGTH && input.storagePath) {
        try {
          typed = await extractLegacyPptViaSoffice(input.storagePath);
        } catch {
          // Optional converter is not guaranteed to exist; fallback below.
        }
      }
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
