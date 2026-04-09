import path from "node:path";

/** Absolute path to the uploads root (all user files must live under this tree). */
export const getUploadsRoot = (): string => path.resolve(process.cwd(), "uploads");

/**
 * Resolve a stored path and ensure it stays inside the uploads directory (path traversal safe).
 * @returns Absolute path, or null if the path escapes the uploads root.
 */
export const resolvePathInsideUploads = (storagePath: string): string | null => {
  const uploadsRoot = getUploadsRoot();
  const resolvedFile = path.resolve(storagePath);
  const relative = path.relative(uploadsRoot, resolvedFile);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return resolvedFile;
};
