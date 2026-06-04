# Swapcard MCP — Tool Shortlist

Decided 2026-06-04. Hybrid model: featured tools below + generic `graphql_query` /
`graphql_mutation` / `introspect_schema` passthrough (covers 100% of the schema).
**Tool style: CONSOLIDATED** — one `manage_*` tool per category with an `action` param.
**Leads API: PARKED for phase 2** (needs a separate exhibitor-scoped token).

**Legend:** 🟢 read · 🟡 create/update (safe write) · 🔴 delete (gated behind confirmation)

---

## 🧰 FINAL CONSOLIDATED TOOL DESIGN (18 featured + 3 infra = 21 tools)

### Read tools (7, dedicated)
- `list_communities` → `communities`
- `search_events` → `events` + `event`
- `search_people` → `eventPerson`
- `search_exhibitors` → `exhibitorsV2`
- `search_sessions` → `planningsV2`
- `search_meetings` → `meetingsV2`
- `list_sponsors` → `sponsors`

### Consolidated write tools (10)
- `manage_people` (update, import, set_meeting_slots, delete🔴)
- `manage_exhibitors` (update, update_many, upsert, import, update_member_roles, delete🔴, delete_event🔴)
- `manage_exhibitor_links` (create_link, update_link, create_relation, delete_link🔴, delete_relation🔴)
- `manage_sessions` (import, create_link, set_redirect_view, delete🔴, delete_views🔴)
- `manage_meetings` (create, update)
- `manage_locations` (create, update)
- `manage_documents` (create_community, update_community, create_event, update_event, delete_event🔴)
- `manage_roles` (create, update, delete🔴)
- `send_push_notification`
- `manage_webhooks` (create, update, delete🔴)

### Analytics (1)
- `get_analytics` → `exportAnalytics`

### Infrastructure (3)
- `graphql_query` — raw read passthrough
- `graphql_mutation` 🔴 — raw write passthrough (gated)
- `introspect_schema` — schema discovery

> Phase 2: `leads`, `myExhibitors`, `scanBadges` (Leads API, exhibitor token).

---

## ✅ FEATURED (12 categories · 49 operations)

### 📖 Queries / Reads (8)
- [x] 🟢 `communities` — list communities
- [x] 🟢 `events` — list/search events
- [x] 🟢 `event` — get one event by ID
- [x] 🟢 `eventPerson` — search people in an event
- [x] 🟢 `exhibitorsV2` — search exhibitors
- [x] 🟢 `planningsV2` — search agenda sessions
- [x] 🟢 `meetingsV2` — search meetings
- [x] 🟢 `sponsors` — list sponsors *(read kept even though Sponsor writes dropped)*

### 👤 People (4)
- [x] 🟡 `updateEventPerson`
- [x] 🟡 `importEventPeople`
- [x] 🟡 `updatePersonMeetingSlotsDisabled`
- [x] 🔴 `deleteEventPeople`

### 🏢 Exhibitors (12)
- [x] 🟡 `updateExhibitor`
- [x] 🟡 `updateExhibitors`
- [x] 🟡 `upsertEventExhibitorsV2`
- [x] 🟡 `importEventExhibitor`
- [x] 🟡 `updateExhibitorMemberRoles`
- [x] 🟡 `createExhibitorLink`
- [x] 🟡 `updateExhibitorLink`
- [x] 🟡 `createExhibitorLinkRelation`
- [x] 🔴 `deleteExhibitorLink`
- [x] 🔴 `deleteExhibitorLinkRelation`
- [x] 🔴 `deleteExhibitors`
- [x] 🔴 `deleteEventExhibitors` *(deprecated)*

### 📅 Agenda / Sessions — Plannings (5)
- [x] 🟡 `importEventPlannings`
- [x] 🟡 `createEventPlanningLink`
- [x] 🟡 `upsertPlanningRedirectUrlView`
- [x] 🔴 `deleteEventPlannings`
- [x] 🔴 `deletePlanningViews`

### 🤝 Meetings (2)
- [x] 🟡 `createMeeting`
- [x] 🟡 `updateMeeting`

### 📍 Locations (2)
- [x] 🟡 `createLocations`
- [x] 🟡 `updateLocations`

### 📄 Documents (5)
- [x] 🟡 `createDocument`
- [x] 🟡 `updateDocument`
- [x] 🟡 `createEventDocument`
- [x] 🟡 `updateEventDocument`
- [x] 🔴 `deleteEventDocument`

### 🔐 Roles (3)
- [x] 🟡 `createRole`
- [x] 🟡 `updateRole`
- [x] 🔴 `deleteRoles`

### 🔔 Push Notifications (1)
- [x] 🟡 `createPushNotification`

### 🪝 Webhooks (3)
- [x] 🟡 `createWebhook`
- [x] 🟡 `updateWebhook`
- [x] 🔴 `deleteWebhook`

### 📊 Analytics API (1) — `event-admin/export/analytics`
- [x] 🟢 `exportAnalytics` — stream of user-action events, filter by event_ids + time window

### 🎯 Leads API (3) — `exhibitor/graphql` ⚠️ PARKED FOR PHASE 2 (needs exhibitor-scoped token)
- [ ] 🟢 `leads`
- [ ] 🟢 `myExhibitors`
- [ ] 🟡 `scanBadges`

---

## ⬜ DROPPED → passthrough-only (7 categories · 29 ops)
Reachable via `graphql_mutation` but not featured as named tools:
Sponsors writes (3) · Products & Categories (7) · Promo/Access Codes (4) ·
Ticket Types (3) · Custom Fields (9) · Groups (1) · Misc/System (2)

---

## 🟦 INFRASTRUCTURE (always included)
- `graphql_query` — raw read passthrough
- `graphql_mutation` 🔴 — raw write passthrough (gated)
- `introspect_schema` — schema discovery helper
