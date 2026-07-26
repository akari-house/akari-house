const opportunitySchemaMarkers = [
  "opportunity_listings",
  "opportunity_user_states",
  "opportunity_updates",
  "opportunity_questions",
  "introduction_requests",
  "investor_profiles",
  "data_room_requests",
] as const;

export function isOpportunitySchemaUnavailable(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);
  const normalised = message.toLowerCase();
  const missingDatabaseObject =
    normalised.includes("no such table") ||
    normalised.includes("no such column") ||
    normalised.includes("d1_error");

  return (
    missingDatabaseObject &&
    opportunitySchemaMarkers.some((marker) => normalised.includes(marker))
  );
}
