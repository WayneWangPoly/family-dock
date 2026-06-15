// Optional helper reference for Step 7.30-7.32.
// If you want Health page to audit smart route tables, add these table names to system-health-check:
// route_departure_plans
// route_departure_legs
// parent_handoff_messages
//
// Data quality checks worth adding later:
// - active plans with high risk
// - plans without legs
// - handoff messages not copied/sent
// - today's route plan missing
export const SMART_ROUTE_QA_TABLES = [
  "route_departure_plans",
  "route_departure_legs",
  "parent_handoff_messages",
];
