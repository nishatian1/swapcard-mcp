import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SWAPCARD_ENDPOINTS } from "../swapcard/endpoints.js";
import { SwapcardError } from "../swapcard/client.js";
import { jsonResult, errorResult } from "./helpers.js";

interface AnalyticsRecord {
  cursor?: string;
  time?: string;
  event?: string;
  platform?: string | null;
  event_id?: string;
  user_id?: string;
  [k: string]: unknown;
}

/**
 * Stream the Swapcard analytics export (newline-delimited JSON), bounded by a record
 * limit and a wall-clock timeout. The stream is "potentially infinite" (it tails live
 * after replaying history from time_gt), so both bounds are essential.
 */
async function streamAnalytics(
  apiKey: string,
  body: Record<string, unknown>,
  limit: number,
  maxMs: number,
): Promise<{ records: AnalyticsRecord[]; lastCursor: string | null; truncated: boolean; reason: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), maxMs);
  const records: AnalyticsRecord[] = [];
  let lastCursor: string | null = null;
  let truncated = false;
  let reason = "stream_end";

  try {
    const resp = await fetch(SWAPCARD_ENDPOINTS.analytics, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        "User-Agent": "swapcard-mcp/0.1",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const t = await resp.text();
      throw new SwapcardError(`Analytics export HTTP ${resp.status}: ${t.slice(0, 300)}`, { status: resp.status });
    }
    if (!resp.body) return { records, lastCursor, truncated, reason: "no_body" };

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        reason = "stream_end";
        break;
      }
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let obj: AnalyticsRecord;
        try {
          obj = JSON.parse(line);
        } catch {
          continue;
        }
        records.push(obj);
        if (typeof obj.cursor === "string") lastCursor = obj.cursor;
        if (records.length >= limit) {
          truncated = true;
          reason = "limit_reached";
          controller.abort();
          return { records, lastCursor, truncated, reason };
        }
      }
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      // Timer fired while waiting for data: report what we have. The stream may hold more.
      reason = "timeout";
      if (records.length > 0) truncated = true;
    } else {
      throw e;
    }
  } finally {
    clearTimeout(timer);
  }

  return { records, lastCursor, truncated, reason };
}

export function registerAnalyticsTool(server: McpServer, apiKey: string): void {
  server.registerTool(
    "get_analytics",
    {
      title: "Get event analytics",
      annotations: { readOnlyHint: true },
      description:
        "Stream user-action analytics for one or more events (e.g. event_show, exhibitor views, " +
        "document opens, session views). Returns a summary (counts by event type, unique users) plus " +
        "raw records, bounded by `limit` and `maxSeconds`. Resume with the returned lastCursor. " +
        "Note: eventIds must be the base64 ids from search_events; timeGt is required.",
      inputSchema: {
        eventIds: z.array(z.string()).min(1).describe("Base64 event ids (from search_events)."),
        timeGt: z.string().describe("Start of the window, ISO 8601 (e.g. 2025-01-01T00:00:00.000Z). Required."),
        timeLt: z.string().optional().describe("End of the window, ISO 8601. Optional."),
        cursor: z.string().optional().describe("Resume after this cursor (from a previous call's lastCursor)."),
        limit: z.number().int().min(1).max(2000).optional().describe("Max records to return (default 100)."),
        maxSeconds: z.number().int().min(1).max(90).optional().describe("Max seconds to read the stream (default 20)."),
      },
    },
    async ({ eventIds, timeGt, timeLt, cursor, limit, maxSeconds }) => {
      try {
        const body: Record<string, unknown> = { event_ids: eventIds, time_gt: timeGt };
        if (timeLt) body.time_lt = timeLt;
        if (cursor) body.cursor = cursor;

        const cap = limit ?? 100;
        const { records, lastCursor, truncated, reason } = await streamAnalytics(
          apiKey,
          body,
          cap,
          (maxSeconds ?? 20) * 1000,
        );

        const byEvent: Record<string, number> = {};
        const users = new Set<string>();
        for (const r of records) {
          if (r.event) byEvent[r.event] = (byEvent[r.event] ?? 0) + 1;
          if (r.user_id) users.add(r.user_id);
        }

        return jsonResult({
          count: records.length,
          truncated,
          reason,
          lastCursor,
          timeRange: { from: records[0]?.time ?? null, to: records[records.length - 1]?.time ?? null },
          summary: { byEvent, uniqueUsers: users.size },
          records,
        });
      } catch (e) {
        return errorResult(e);
      }
    },
  );
}
