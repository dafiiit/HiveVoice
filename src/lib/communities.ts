import type { GroupTool } from "./group-tools";
// Starting points for the kinds of communities that use HiveVoice: each one sets the group's kind, rights template,
// visibility, joining, age limit, task board and themes. Everything stays changeable afterwards. The reasoning behind
// each preset is in docs/verknuepfungen.md.
export type CommunityPreset = {
  key: string;
  kind: "project" | "club" | "initiative" | "community" | "other";
  template: "project" | "club" | "initiative";
  visibility: "public" | "members" | "secret";
  joinPolicy: "open" | "request" | "invite";
  adultsOnly: boolean;
  modTasks: boolean;
  tags: string[];
  /** The tools the group starts with (GROUP_TOOLS); all when left out. */
  tools?: GroupTool[];
};

export const COMMUNITIES: CommunityPreset[] = [
  // Small and private: a chat among a few people (or two), tools switched on when needed.
  { key: "chat", kind: "other", template: "project", visibility: "secret", joinPolicy: "invite", adultsOnly: false, modTasks: true, tags: [], tools: [] },
  { key: "couple", kind: "other", template: "project", visibility: "secret", joinPolicy: "invite", adultsOnly: false, modTasks: true, tags: [], tools: ["tasks", "expenses", "calendar", "links"] },
  { key: "flatshare", kind: "community", template: "project", visibility: "secret", joinPolicy: "invite", adultsOnly: false, modTasks: true, tags: ["wg"], tools: ["tasks", "calendar", "expenses", "links"] },
  { key: "sports", kind: "club", template: "club", visibility: "public", joinPolicy: "request", adultsOnly: false, modTasks: true, tags: ["sport", "verein", "training"] },
  { key: "school", kind: "community", template: "club", visibility: "secret", joinPolicy: "invite", adultsOnly: false, modTasks: true, tags: ["schule", "eltern"] },
  { key: "daycare", kind: "community", template: "club", visibility: "secret", joinPolicy: "invite", adultsOnly: true, modTasks: true, tags: ["kita", "eltern"] },
  { key: "neighbours", kind: "community", template: "project", visibility: "members", joinPolicy: "request", adultsOnly: false, modTasks: true, tags: ["nachbarschaft", "hausgemeinschaft"] },
  { key: "faith", kind: "community", template: "club", visibility: "public", joinPolicy: "request", adultsOnly: false, modTasks: true, tags: ["gemeinde", "ehrenamt"] },
  { key: "firebrigade", kind: "club", template: "club", visibility: "members", joinPolicy: "invite", adultsOnly: false, modTasks: true, tags: ["feuerwehr", "ehrenamt"] },
  { key: "foodsharing", kind: "project", template: "project", visibility: "public", joinPolicy: "open", adultsOnly: false, modTasks: true, tags: ["essen", "foodsharing", "nachhaltigkeit"] },
  { key: "repair", kind: "project", template: "project", visibility: "public", joinPolicy: "open", adultsOnly: false, modTasks: true, tags: ["repair-cafe", "werkstatt", "fahrrad-reparatur"] },
  { key: "citizens", kind: "initiative", template: "initiative", visibility: "public", joinPolicy: "open", adultsOnly: false, modTasks: true, tags: ["buergerinitiative", "stadtteil"] },
  { key: "housing", kind: "community", template: "club", visibility: "members", joinPolicy: "invite", adultsOnly: true, modTasks: true, tags: ["wohnprojekt", "genossenschaft"] },
];
