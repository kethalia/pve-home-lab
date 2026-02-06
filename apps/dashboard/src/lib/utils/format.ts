/**
 * Shared formatting and parsing utilities.
 */

/**
 * Format a memory value in MB to a human-readable string.
 * Returns "GB" for values >= 1024 MB.
 */
export function formatMemory(mb: number | null, showBoth = false): string {
  if (mb === null) return "—";
  if (mb >= 1024) {
    const gb = (mb / 1024).toFixed(1);
    return showBoth ? `${gb} GB (${mb} MB)` : `${gb} GB`;
  }
  return `${mb} MB`;
}

/**
 * Parse semicolon-separated tags string into an array.
 * Handles null/undefined, trims whitespace, filters empty strings.
 */
export function parseTags(tags: string | null | undefined): string[] {
  if (!tags) return [];
  return tags
    .split(";")
    .map((t) => t.trim())
    .filter(Boolean);
}
