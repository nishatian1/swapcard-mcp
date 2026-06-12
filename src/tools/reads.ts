import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { swapcardGraphQL } from "../swapcard/client.js";
import { cursorPageFields, buildCursor, jsonObject } from "../swapcard/pagination.js";
import {
  EVENT_SEL,
  EVENT_PERSON_SEL,
  EXHIBITOR_SEL,
  MEETING_SEL,
  PLANNING_SEL,
  SPONSOR_SEL,
} from "../swapcard/selections.js";
import { jsonResult, errorResult } from "./helpers.js";

/** Read-only tools: communities, events, people, exhibitors, sessions, meetings, sponsors. */
export function registerReadTools(server: McpServer, apiKey: string): void {
  const run = async (query: string, variables?: Record<string, unknown>) =>
    (await swapcardGraphQL<Record<string, unknown>>(apiKey, query, variables)).data;

  // --- list_communities ---------------------------------------------------
  server.registerTool(
    "list_communities",
    {
      title: "List Swapcard communities",
      annotations: { readOnlyHint: true },
      description:
        "List the Swapcard communities this API key can access (id + name + slug). " +
        "Use a returned community id as communityId for search_exhibitors / search_sessions.",
      inputSchema: { ...cursorPageFields },
    },
    async ({ first, after }) => {
      try {
        const query = `query ListCommunities($cursor: CursorPaginationInput) {
  communities(cursor: $cursor) {
    nodes { id name slug }
    pageInfo { hasNextPage endCursor }
  }
}`;
        return jsonResult((await run(query, { cursor: buildCursor(first, after) })).communities);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // --- search_events ------------------------------------------------------
  server.registerTool(
    "search_events",
    {
      title: "Search / list events",
      annotations: { readOnlyHint: true },
      description:
        "List events the key can access. Filter by ids or slugs, or page through all. " +
        "Returns core event fields incl. begins/ends, timezone, community. " +
        "Pass a single id in `ids` to fetch one event. For advanced `filters`, " +
        "use introspect_schema('EventFilterInput').",
      inputSchema: {
        ids: z.array(z.string()).optional().describe("Event ids to fetch."),
        slugs: z.array(z.string()).optional().describe("Event slugs to fetch."),
        page: z.number().int().min(1).optional().describe("1-based page number."),
        pageSize: z.number().int().min(1).max(100).optional().describe("Items per page (max 100)."),
        filters: z.array(jsonObject).optional().describe("Advanced EventFilterInput[] passthrough."),
      },
    },
    async ({ ids, slugs, page, pageSize, filters }) => {
      try {
        const query = `query SearchEvents($ids:[String!],$slugs:[String!],$filters:[EventFilterInput!],$page:Int,$pageSize:Int) {
  events(ids:$ids, slugs:$slugs, filters:$filters, page:$page, pageSize:$pageSize) { ${EVENT_SEL} }
}`;
        return jsonResult((await run(query, { ids, slugs, page, pageSize, filters })).events);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // --- search_people ------------------------------------------------------
  server.registerTool(
    "search_people",
    {
      title: "Search event people",
      annotations: { readOnlyHint: true },
      description:
        "Search attendees/speakers in an event (by name/email/etc. via `search`). " +
        "Returns profile fields. For advanced filters/sort, see introspect_schema('EventPersonFilter').",
      inputSchema: {
        eventId: z.string().describe("Event id (from search_events)."),
        search: z.string().optional().describe("Free-text search across people."),
        ...cursorPageFields,
        filters: z.array(jsonObject).optional().describe("Advanced EventPersonFilter[] passthrough."),
        sort: z.array(jsonObject).optional().describe("Advanced EventPersonSort[] passthrough."),
      },
    },
    async ({ eventId, search, first, after, filters, sort }) => {
      try {
        const query = `query SearchPeople($eventId:ID!,$search:String,$cursor:CursorPaginationInput,$filters:[EventPersonFilter!],$sort:[EventPersonSort!]) {
  eventPerson(eventId:$eventId, search:$search, cursor:$cursor, filters:$filters, sort:$sort) {
    totalCount
    pageInfo { hasNextPage endCursor }
    nodes { ${EVENT_PERSON_SEL} }
  }
}`;
        return jsonResult(
          (await run(query, { eventId, search, cursor: buildCursor(first, after), filters, sort })).eventPerson,
        );
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // --- search_exhibitors --------------------------------------------------
  server.registerTool(
    "search_exhibitors",
    {
      title: "Search exhibitors",
      annotations: { readOnlyHint: true },
      description:
        "Search exhibitors in a community. Returns core exhibitor fields. " +
        "For advanced filter/sort, see introspect_schema('CommunityExhibitorsFilterInput').",
      inputSchema: {
        communityId: z.string().describe("Community id (from list_communities)."),
        search: z.string().optional().describe("Free-text search across exhibitors."),
        ...cursorPageFields,
        filter: jsonObject.optional().describe("Advanced CommunityExhibitorsFilterInput passthrough."),
        sort: jsonObject.optional().describe("Advanced EventExhibitorsSortInput passthrough."),
      },
    },
    async ({ communityId, search, first, after, filter, sort }) => {
      try {
        const query = `query SearchExhibitors($communityId:ID!,$search:String,$cursor:CursorPaginationInput,$filter:CommunityExhibitorsFilterInput,$sort:EventExhibitorsSortInput) {
  exhibitorsV2(communityId:$communityId, search:$search, cursor:$cursor, filter:$filter, sort:$sort) {
    totalCount
    pageInfo { hasNextPage endCursor }
    nodes { ${EXHIBITOR_SEL} }
  }
}`;
        return jsonResult(
          (await run(query, { communityId, search, cursor: buildCursor(first, after), filter, sort })).exhibitorsV2,
        );
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // --- search_sessions (plannings) ---------------------------------------
  server.registerTool(
    "search_sessions",
    {
      title: "Search agenda sessions",
      annotations: { readOnlyHint: true },
      description:
        "Search agenda sessions ('plannings') in a community. Returns title, times (UTC), place, format. " +
        "For advanced filter/sort, see introspect_schema('EventPlanningFilterInput').",
      inputSchema: {
        communityId: z.string().describe("Community id (from list_communities)."),
        search: z.string().optional().describe("Free-text search across sessions."),
        ...cursorPageFields,
        filter: jsonObject.optional().describe("Advanced EventPlanningFilterInput passthrough."),
        sort: z.array(jsonObject).optional().describe("Advanced PlanningSortType[] passthrough."),
      },
    },
    async ({ communityId, search, first, after, filter, sort }) => {
      try {
        const query = `query SearchSessions($communityId:ID!,$search:String,$cursor:CursorPaginationInput,$filter:EventPlanningFilterInput,$sort:[PlanningSortType!]) {
  planningsV2(communityId:$communityId, search:$search, cursor:$cursor, filter:$filter, sort:$sort) {
    totalCount
    pageInfo { hasNextPage endCursor }
    nodes { ${PLANNING_SEL} }
  }
}`;
        return jsonResult(
          (await run(query, { communityId, search, cursor: buildCursor(first, after), filter, sort })).planningsV2,
        );
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // --- search_meetings ----------------------------------------------------
  server.registerTool(
    "search_meetings",
    {
      title: "Search meetings",
      annotations: { readOnlyHint: true },
      description:
        "Search meetings in an event. Returns status, slot times, and participants. " +
        "For advanced filters/sort, see introspect_schema('MeetingFilterInput').",
      inputSchema: {
        eventId: z.string().describe("Event id (from search_events)."),
        search: z.string().optional().describe("Free-text search across meetings."),
        ...cursorPageFields,
        filters: z.array(jsonObject).optional().describe("Advanced MeetingFilterInput[] passthrough."),
        sort: z.array(jsonObject).optional().describe("Advanced MeetingSortInput[] passthrough."),
      },
    },
    async ({ eventId, search, first, after, filters, sort }) => {
      try {
        const query = `query SearchMeetings($eventId:ID!,$search:String,$cursor:CursorPaginationInput,$filters:[MeetingFilterInput!],$sort:[MeetingSortInput!]) {
  meetingsV2(eventId:$eventId, search:$search, cursor:$cursor, filters:$filters, sort:$sort) {
    totalCount
    pageInfo { hasNextPage endCursor }
    nodes { ${MEETING_SEL} }
  }
}`;
        return jsonResult(
          (await run(query, { eventId, search, cursor: buildCursor(first, after), filters, sort })).meetingsV2,
        );
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // --- list_sponsors ------------------------------------------------------
  server.registerTool(
    "list_sponsors",
    {
      title: "List sponsors",
      annotations: { readOnlyHint: true },
      description: "List sponsors for an event (optionally filter by ids or search). Returns name, logo, type, category.",
      inputSchema: {
        eventId: z.string().describe("Event id (from search_events)."),
        ids: z.array(z.string()).optional().describe("Sponsor ids to fetch."),
        search: z.string().optional().describe("Free-text search across sponsors."),
      },
    },
    async ({ eventId, ids, search }) => {
      try {
        const query = `query ListSponsors($eventId:String!,$ids:[String!],$search:String) {
  sponsors(eventId:$eventId, ids:$ids, search:$search) { ${SPONSOR_SEL} }
}`;
        return jsonResult((await run(query, { eventId, ids, search })).sponsors);
      } catch (e) {
        return errorResult(e);
      }
    },
  );
}
