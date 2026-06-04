import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { SwapcardError } from "../swapcard/client.js";

/** Wrap arbitrary JSON-serializable data as a successful tool result. */
export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

/** Convert any thrown error into a readable, structured tool error result. */
export function errorResult(e: unknown): CallToolResult {
  let msg: string;
  if (e instanceof SwapcardError) {
    msg = `Swapcard error: ${e.message}`;
    const errs = e.details?.errors ?? [];
    if (errs.length) {
      msg +=
        "\n" +
        errs
          .map((x) => ` - ${x.message}${x.path ? ` (at ${x.path.join(".")})` : ""}`)
          .join("\n");
    }
  } else {
    msg = `Error: ${(e as Error)?.message ?? String(e)}`;
  }
  return { content: [{ type: "text", text: msg }], isError: true };
}
