import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { swapcardGraphQL } from "../swapcard/client.js";
import { jsonResult, errorResult } from "./helpers.js";
import { manageTool, req, wf, PE, VE } from "./write-helpers.js";

/** All consolidated write tools + send_push_notification. */
export function registerWriteTools(server: McpServer, apiKey: string): void {
  // === manage_people ======================================================
  manageTool(server, apiKey, {
    name: "manage_people",
    title: "Manage event people",
    description:
      "Create/update/import/delete people in an event.\n" +
      "- update: input = UpdateEventPersonV2Input\n" +
      "- import: eventId + data[] = ImportEventPersonInput[] (supports validateOnly)\n" +
      "- set_meeting_slots: input = UpdatePersonMeetingSlotsDisabledInput\n" +
      "- delete: eventId + ids[] (eventPeopleIds) — requires confirm:true",
    schema: {
      action: z.enum(["update", "import", "set_meeting_slots", "delete"]),
      input: wf.input,
      data: wf.data,
      eventId: wf.eventId,
      ids: wf.ids,
      validateOnly: wf.validateOnly,
      confirm: wf.confirm,
    },
    actions: {
      update: {
        build: (a) => ({
          query: `mutation($input: UpdateEventPersonV2Input!){ updateEventPerson(input:$input){ eventPerson{ id firstName lastName email } ${PE} } }`,
          variables: { input: req(a.input, "input") },
        }),
      },
      import: {
        build: (a) => ({
          query: `mutation($eventId: ID!, $data: [ImportEventPersonInput!]!, $validateOnly: Boolean){ importEventPeople(eventId:$eventId, data:$data, validateOnly:$validateOnly){ eventPeopleCreated eventPeopleUpdated ${VE} } }`,
          variables: { eventId: req(a.eventId, "eventId"), data: req(a.data, "data"), validateOnly: a.validateOnly },
        }),
      },
      set_meeting_slots: {
        build: (a) => ({
          query: `mutation($input: UpdatePersonMeetingSlotsDisabledInput!){ updatePersonMeetingSlotsDisabled(input:$input){ person{ id } ${PE} } }`,
          variables: { input: req(a.input, "input") },
        }),
      },
      delete: {
        destructive: "deletes event people",
        build: (a) => ({
          query: `mutation($eventId: ID!, $ids: [ID!]!){ deleteEventPeople(eventId:$eventId, eventPeopleIds:$ids){ eventPeopleDeleted } }`,
          variables: { eventId: req(a.eventId, "eventId"), ids: req(a.ids, "ids") },
        }),
      },
    },
  });

  // === manage_exhibitors ==================================================
  manageTool(server, apiKey, {
    name: "manage_exhibitors",
    title: "Manage exhibitors",
    description:
      "Create/update/import/delete exhibitors.\n" +
      "- update: input = UpdateExhibitorInput\n" +
      "- update_many: input = UpdateExhibitorsInput\n" +
      "- upsert: eventId + data[] = ExhibitorInput[] (supports validateOnly)\n" +
      "- import: eventId + data[] = ImportEventExhibitorInput[] (supports validateOnly)\n" +
      "- update_member_roles: input = UpdateExhibitorMemberRolesInput\n" +
      "- delete: input = DeleteExhibitorsInput — requires confirm:true\n" +
      "- delete_event: eventId + ids[] (exhibitorsIds) — requires confirm:true",
    schema: {
      action: z.enum(["update", "update_many", "upsert", "import", "update_member_roles", "delete", "delete_event"]),
      input: wf.input,
      data: wf.data,
      eventId: wf.eventId,
      ids: wf.ids,
      validateOnly: wf.validateOnly,
      confirm: wf.confirm,
    },
    actions: {
      update: {
        build: (a) => ({
          query: `mutation($input: UpdateExhibitorInput!){ updateExhibitor(input:$input){ exhibitor{ id name } ${PE} } }`,
          variables: { input: req(a.input, "input") },
        }),
      },
      update_many: {
        build: (a) => ({
          query: `mutation($input: UpdateExhibitorsInput!){ updateExhibitors(input:$input){ exhibitors{ id name } ${PE} } }`,
          variables: { input: req(a.input, "input") },
        }),
      },
      upsert: {
        build: (a) => ({
          query: `mutation($eventId: String!, $exhibitors: [ExhibitorInput!]!, $validateOnly: Boolean){ upsertEventExhibitorsV2(eventId:$eventId, exhibitors:$exhibitors, validateOnly:$validateOnly){ results{ inputId exhibitor{ id name } } ${VE} } }`,
          variables: { eventId: req(a.eventId, "eventId"), exhibitors: req(a.data, "data"), validateOnly: a.validateOnly },
        }),
      },
      import: {
        build: (a) => ({
          query: `mutation($eventId: ID!, $exhibitors: [ImportEventExhibitorInput!]!, $validateOnly: Boolean){ importEventExhibitor(eventId:$eventId, exhibitors:$exhibitors, validateOnly:$validateOnly){ results{ inputId exhibitor{ id name } } ${VE} } }`,
          variables: { eventId: req(a.eventId, "eventId"), exhibitors: req(a.data, "data"), validateOnly: a.validateOnly },
        }),
      },
      update_member_roles: {
        build: (a) => ({
          query: `mutation($input: UpdateExhibitorMemberRolesInput!){ updateExhibitorMemberRoles(input:$input){ exhibitorMember{ id } ${PE} } }`,
          variables: { input: req(a.input, "input") },
        }),
      },
      delete: {
        destructive: "deletes exhibitors",
        build: (a) => ({
          query: `mutation($input: DeleteExhibitorsInput!){ deleteExhibitors(input:$input){ deletedExhibitorsIds ${PE} } }`,
          variables: { input: req(a.input, "input") },
        }),
      },
      delete_event: {
        destructive: "removes exhibitors from an event",
        build: (a) => ({
          query: `mutation($eventId: String!, $ids: [String!]!){ deleteEventExhibitors(eventId:$eventId, exhibitorsIds:$ids){ id name } }`,
          variables: { eventId: req(a.eventId, "eventId"), ids: req(a.ids, "ids") },
        }),
      },
    },
  });

  // === manage_exhibitor_links =============================================
  manageTool(server, apiKey, {
    name: "manage_exhibitor_links",
    title: "Manage exhibitor links & relations",
    description:
      "Exhibitor links group exhibitors; relations connect two exhibitors within a link.\n" +
      "- create_link: input = CreateExhibitorLinkInput\n" +
      "- update_link: input = UpdateExhibitorLinkInput\n" +
      "- create_relation: input = CreateExhibitorLinkRelationInput\n" +
      "- delete_link: input = DeleteExhibitorLinkInput — requires confirm:true\n" +
      "- delete_relation: input = DeleteExhibitorLinkRelationInput — requires confirm:true",
    schema: {
      action: z.enum(["create_link", "update_link", "create_relation", "delete_link", "delete_relation"]),
      input: wf.input,
      confirm: wf.confirm,
    },
    actions: {
      create_link: {
        build: (a) => ({
          query: `mutation($input: CreateExhibitorLinkInput!){ createExhibitorLink(input:$input){ exhibitorLink{ id } ${PE} } }`,
          variables: { input: req(a.input, "input") },
        }),
      },
      update_link: {
        build: (a) => ({
          query: `mutation($input: UpdateExhibitorLinkInput!){ updateExhibitorLink(input:$input){ exhibitorLink{ id } ${PE} } }`,
          variables: { input: req(a.input, "input") },
        }),
      },
      create_relation: {
        build: (a) => ({
          query: `mutation($input: CreateExhibitorLinkRelationInput!){ createExhibitorLinkRelation(input:$input){ exhibitorLink{ id } parentExhibitor{ id } childExhibitor{ id } ${PE} } }`,
          variables: { input: req(a.input, "input") },
        }),
      },
      delete_link: {
        destructive: "deletes an exhibitor link and all its relations",
        build: (a) => ({
          query: `mutation($input: DeleteExhibitorLinkInput!){ deleteExhibitorLink(input:$input){ deletedExhibitorLinkId ${PE} } }`,
          variables: { input: req(a.input, "input") },
        }),
      },
      delete_relation: {
        destructive: "deletes a relation between two exhibitors",
        build: (a) => ({
          query: `mutation($input: DeleteExhibitorLinkRelationInput!){ deleteExhibitorLinkRelation(input:$input){ exhibitorLink{ id } ${PE} } }`,
          variables: { input: req(a.input, "input") },
        }),
      },
    },
  });

  // === manage_sessions ====================================================
  manageTool(server, apiKey, {
    name: "manage_sessions",
    title: "Manage agenda sessions (plannings)",
    description:
      "Import/link/delete agenda sessions.\n" +
      "- import: eventId + data[] = ImportEventPlanningInput[] (supports validateOnly)\n" +
      "- create_link: eventId + input = CreatePlanningLinkInput\n" +
      "- set_redirect_view: input = UpsertPlanningRedirectUrlViewInput\n" +
      "- delete: eventId + ids[] (planningsIds) — requires confirm:true\n" +
      "- delete_views: input = DeletePlanningViewsInput — requires confirm:true",
    schema: {
      action: z.enum(["import", "create_link", "set_redirect_view", "delete", "delete_views"]),
      input: wf.input,
      data: wf.data,
      eventId: wf.eventId,
      ids: wf.ids,
      validateOnly: wf.validateOnly,
      confirm: wf.confirm,
    },
    actions: {
      import: {
        build: (a) => ({
          query: `mutation($eventId: ID!, $plannings: [ImportEventPlanningInput!]!, $validateOnly: Boolean){ importEventPlannings(eventId:$eventId, plannings:$plannings, validateOnly:$validateOnly){ eventPlanningCreated eventPlanningUpdated ${VE} } }`,
          variables: { eventId: req(a.eventId, "eventId"), plannings: req(a.data, "data"), validateOnly: a.validateOnly },
        }),
      },
      create_link: {
        build: (a) => ({
          query: `mutation($data: CreatePlanningLinkInput!, $eventId: String!){ createEventPlanningLink(data:$data, eventId:$eventId){ id eventId } }`,
          variables: { data: req(a.input, "input"), eventId: req(a.eventId, "eventId") },
        }),
      },
      set_redirect_view: {
        build: (a) => ({
          query: `mutation($input: UpsertPlanningRedirectUrlViewInput!){ upsertPlanningRedirectUrlView(input:$input){ planning{ id } view{ __typename } ${PE} } }`,
          variables: { input: req(a.input, "input") },
        }),
      },
      delete: {
        destructive: "deletes agenda sessions",
        build: (a) => ({
          query: `mutation($eventId: String!, $ids: [String!]!){ deleteEventPlannings(eventId:$eventId, planningsIds:$ids){ id title } }`,
          variables: { eventId: req(a.eventId, "eventId"), ids: req(a.ids, "ids") },
        }),
      },
      delete_views: {
        destructive: "deletes views from a planning",
        build: (a) => ({
          query: `mutation($input: DeletePlanningViewsInput!){ deletePlanningViews(input:$input){ deletedPlanningViewsIds ${PE} } }`,
          variables: { input: req(a.input, "input") },
        }),
      },
    },
  });

  // === manage_meetings ====================================================
  manageTool(server, apiKey, {
    name: "manage_meetings",
    title: "Manage meetings",
    description:
      "Create/update meetings.\n" +
      "- create: input = CreateMeetingInput\n" +
      "- update: input = UpdateMeetingInput",
    schema: { action: z.enum(["create", "update"]), input: wf.input },
    actions: {
      create: {
        build: (a) => ({
          query: `mutation($input: CreateMeetingInput!){ createMeeting(input:$input){ meeting{ id status } ${PE} } }`,
          variables: { input: req(a.input, "input") },
        }),
      },
      update: {
        build: (a) => ({
          query: `mutation($input: UpdateMeetingInput!){ updateMeeting(input:$input){ meeting{ id status } ${PE} } }`,
          variables: { input: req(a.input, "input") },
        }),
      },
    },
  });

  // === manage_locations ===================================================
  manageTool(server, apiKey, {
    name: "manage_locations",
    title: "Manage locations",
    description:
      "Create/update event locations.\n" +
      "- create: input = CreateLocationsInput\n" +
      "- update: input = UpdateLocationsInput",
    schema: { action: z.enum(["create", "update"]), input: wf.input },
    actions: {
      create: {
        build: (a) => ({
          query: `mutation($input: CreateLocationsInput!){ createLocations(input:$input){ locations{ id name } ${PE} } }`,
          variables: { input: req(a.input, "input") },
        }),
      },
      update: {
        build: (a) => ({
          query: `mutation($input: UpdateLocationsInput!){ updateLocations(input:$input){ locations{ id name } ${PE} } }`,
          variables: { input: req(a.input, "input") },
        }),
      },
    },
  });

  // === manage_documents ===================================================
  manageTool(server, apiKey, {
    name: "manage_documents",
    title: "Manage documents",
    description:
      "Create/update/delete community and event documents.\n" +
      "- create_community: communityId + input = CreateDocumentInput (optional eventId)\n" +
      "- update_community: id + input = UpdateDocumentInput (optional communityId/eventId)\n" +
      "- create_event: eventId + input = CreateDocumentInput\n" +
      "- update_event: id + input = UpdateDocumentInput (optional eventId)\n" +
      "- delete_event: eventId + ids[] — requires confirm:true",
    schema: {
      action: z.enum(["create_community", "update_community", "create_event", "update_event", "delete_event"]),
      input: wf.input,
      id: wf.id,
      ids: wf.ids,
      communityId: wf.communityId,
      eventId: wf.eventId,
      confirm: wf.confirm,
    },
    actions: {
      create_community: {
        build: (a) => ({
          query: `mutation($document: CreateDocumentInput!, $communityId: ID!, $eventId: ID){ createDocument(document:$document, communityId:$communityId, eventId:$eventId){ document{ id name url } ${PE} } }`,
          variables: { document: req(a.input, "input"), communityId: req(a.communityId, "communityId"), eventId: a.eventId },
        }),
      },
      update_community: {
        build: (a) => ({
          query: `mutation($document: UpdateDocumentInput!, $id: ID!, $communityId: ID, $eventId: ID){ updateDocument(document:$document, id:$id, communityId:$communityId, eventId:$eventId){ document{ id name url } ${PE} } }`,
          variables: { document: req(a.input, "input"), id: req(a.id, "id"), communityId: a.communityId, eventId: a.eventId },
        }),
      },
      create_event: {
        build: (a) => ({
          query: `mutation($document: CreateDocumentInput!, $eventId: ID!){ createEventDocument(document:$document, eventId:$eventId){ id name url } }`,
          variables: { document: req(a.input, "input"), eventId: req(a.eventId, "eventId") },
        }),
      },
      update_event: {
        build: (a) => ({
          query: `mutation($document: UpdateDocumentInput!, $eventId: ID, $id: ID!){ updateEventDocument(document:$document, eventId:$eventId, id:$id){ id name url } }`,
          variables: { document: req(a.input, "input"), id: req(a.id, "id"), eventId: a.eventId },
        }),
      },
      delete_event: {
        destructive: "deletes event documents",
        build: (a) => ({
          query: `mutation($eventId: ID!, $ids: [ID!]!){ deleteEventDocument(eventId:$eventId, ids:$ids) }`,
          variables: { eventId: req(a.eventId, "eventId"), ids: req(a.ids, "ids") },
        }),
      },
    },
  });

  // === manage_roles =======================================================
  manageTool(server, apiKey, {
    name: "manage_roles",
    title: "Manage roles",
    description:
      "Create/update/delete roles.\n" +
      "- create: input = CreateRoleInput\n" +
      "- update: input = UpdateRoleInput\n" +
      "- delete: input = DeleteRolesInput — requires confirm:true",
    schema: { action: z.enum(["create", "update", "delete"]), input: wf.input, confirm: wf.confirm },
    actions: {
      create: {
        build: (a) => ({
          query: `mutation($input: CreateRoleInput!){ createRole(input:$input){ role{ id name } ${PE} } }`,
          variables: { input: req(a.input, "input") },
        }),
      },
      update: {
        build: (a) => ({
          query: `mutation($input: UpdateRoleInput!){ updateRole(input:$input){ role{ id name } ${PE} } }`,
          variables: { input: req(a.input, "input") },
        }),
      },
      delete: {
        destructive: "deletes roles",
        build: (a) => ({
          query: `mutation($input: DeleteRolesInput!){ deleteRoles(input:$input){ deletedRoleIds ${PE} } }`,
          variables: { input: req(a.input, "input") },
        }),
      },
    },
  });

  // === manage_webhooks ====================================================
  manageTool(server, apiKey, {
    name: "manage_webhooks",
    title: "Manage webhooks",
    description:
      "Create/update/delete webhook subscriptions (events: PROFILE_CREATE/UPDATE, EXHIBITOR_CREATE/UPDATE, PLANNING_CREATE/UPDATE).\n" +
      "- create: input = CreateWebhookInput\n" +
      "- update: input = UpdateWebhookInput\n" +
      "- delete: input = DeleteWebhookInput — requires confirm:true",
    schema: { action: z.enum(["create", "update", "delete"]), input: wf.input, confirm: wf.confirm },
    actions: {
      create: {
        build: (a) => ({
          query: `mutation($input: CreateWebhookInput!){ createWebhook(input:$input){ webhook{ id name endpoint } ${PE} } }`,
          variables: { input: req(a.input, "input") },
        }),
      },
      update: {
        build: (a) => ({
          query: `mutation($input: UpdateWebhookInput!){ updateWebhook(input:$input){ webhook{ id name endpoint } ${PE} } }`,
          variables: { input: req(a.input, "input") },
        }),
      },
      delete: {
        destructive: "deletes a webhook",
        build: (a) => ({
          query: `mutation($input: DeleteWebhookInput!){ deleteWebhook(input:$input){ webhook{ id } ${PE} } }`,
          variables: { input: req(a.input, "input") },
        }),
      },
    },
  });

  // === send_push_notification (single-purpose) ============================
  server.registerTool(
    "send_push_notification",
    {
      title: "Send a push notification",
      description:
        "Create/send a push notification. input = CreatePushNotificationInput " +
        "(use introspect_schema('CreatePushNotificationInput') for fields).",
      inputSchema: { input: z.record(z.unknown()).describe("CreatePushNotificationInput object.") },
    },
    async ({ input }) => {
      try {
        const query = `mutation($input: CreatePushNotificationInput!){ createPushNotification(input:$input){ pushNotification{ id title status } ${PE} } }`;
        const { data } = await swapcardGraphQL(apiKey, query, { input });
        return jsonResult(data);
      } catch (e) {
        return errorResult(e);
      }
    },
  );
}
