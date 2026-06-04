import { z } from "zod";

/** Zod fields for Relay-style cursor pagination (Swapcard CursorPaginationInput: first/after). */
export const cursorPageFields = {
  first: z.number().int().min(1).max(100).optional().describe("Page size (max 100)."),
  after: z
    .string()
    .optional()
    .describe("Pagination cursor: pass pageInfo.endCursor from a previous call to get the next page."),
};

/** Build a CursorPaginationInput value, or undefined when no pagination args were given. */
export function buildCursor(first?: number, after?: string): { first?: number; after?: string } | undefined {
  return first !== undefined || after !== undefined ? { first, after } : undefined;
}

/** Permissive JSON object schema, used for advanced filter/sort passthrough args. */
export const jsonObject = z.record(z.unknown());
