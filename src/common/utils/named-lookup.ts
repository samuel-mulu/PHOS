/** Builds an UPPER_SNAKE code (max 40 chars) from a free-text name. */
export function codeFromName(name: string): string {
  const base = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 36);
  return base || "CUSTOM";
}

/**
 * Returns the first of CODE, CODE_2, CODE_3, ... that `exists` reports as free.
 */
export async function uniqueCode(
  base: string,
  exists: (code: string) => Promise<boolean>,
): Promise<string> {
  if (!(await exists(base))) return base;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${base}_${i}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${base}_${Date.now()}`;
}
