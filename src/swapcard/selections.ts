/**
 * Curated default GraphQL selection sets for the featured read tools.
 * These cover the most commonly useful fields; for anything else, use the
 * `graphql_query` tool (full schema access) or `introspect_schema` to discover fields.
 */

export const EVENT_SEL = `
  id title slug beginsAt endsAt timezone language code
  description htmlDescription twitterHashtag latitude longitude
  visibility isPublic createdAt updatedAt
  community { id name slug }
`;

export const EVENT_PERSON_SEL = `
  id userId communityProfileId email firstName lastName
  jobTitle organization photoUrl websiteUrl biography
  isVisible type createdAt updatedAt
`;

export const EXHIBITOR_SEL = `
  id name email description logoUrl websiteUrl backgroundImageUrl
  type totalMembers createdAt updatedAt
`;

export const MEETING_SEL = `
  id status description source maxParticipants averageRating
  canCancel canReschedule createdAt
  slot { id beginsAt endsAt }
  participants {
    id status isOrganizer
    person { id firstName lastName email jobTitle organization }
    exhibitor { id name }
  }
`;

export const PLANNING_SEL = `
  id title description beginsAtUTC endsAtUTC place type format
  maxSeats totalAttendees categories isPrivate twitterHashtag
  createdAt updatedAt
`;

export const SPONSOR_SEL = `
  __typename
  ... on Sponsor { id name type mode logoUrl externalUrl category { id name value color } }
  ... on SponsorExhibitor { id name type mode logoUrl category { id name value color } }
`;
