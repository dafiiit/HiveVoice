// The tools a group can switch on. Chat ("talk"), members ("team") and the about page are always there,
// so a group of two can start as a plain chat and grow into a full organisation.
export const GROUP_TOOLS = ["goals", "tasks", "expenses", "links", "collection", "needs", "calendar", "nextcloud"] as const;
export type GroupTool = (typeof GROUP_TOOLS)[number];
