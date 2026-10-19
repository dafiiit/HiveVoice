// Files and polls that hang on messages, posts and shared knowledge. Safe to import in the browser and on the server.
export const FILE_BUCKET = "files";
export const FILE_LIMIT = 10 * 1024 * 1024;
export const MAX_FILES = 6;

export const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
  pdf: "application/pdf", md: "text/markdown", markdown: "text/markdown", txt: "text/plain", csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet",
  odp: "application/vnd.oasis.opendocument.presentation",
};
export const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf",
  "text/markdown": "md", "text/plain": "txt", "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.oasis.opendocument.text": "odt", "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "application/vnd.oasis.opendocument.presentation": "odp",
};
/** For the file picker: everything the bucket accepts. */
export const FILE_ACCEPT = Object.values(EXT_BY_MIME).map((e) => `.${e}`).join(",");

/** Browsers often send no type for .md files, so the ending decides when the type is missing or generic. */
export function mimeOf(file: { name: string; type: string }): string | null {
  if (file.type && EXT_BY_MIME[file.type]) return file.type;
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  return MIME_BY_EXT[ext] ?? null;
}

export type UploadedFile = { path: string; name: string; mime: string; size: number };
export type Attachment = { id: string; name: string; mime: string; size_bytes: number };
export type PollOption = { id: string; label: string; votes: number; mine: boolean };
export type PollView = { id: string; question: string; multiple: boolean; closed: boolean; closes_at?: string | null; can_manage?: boolean; voters: number; options: PollOption[] };
export type PollDraft = { question: string; options: string[]; multiple: boolean; hours?: number };

export const isImage = (mime: string) => mime.startsWith("image/");

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** A poll draft is ready when it has a question and at least two filled options. */
export const pollReady = (p: PollDraft | null) => !!p && p.question.trim().length > 0 && p.options.filter((o) => o.trim()).length >= 2;
export const cleanPoll = (p: PollDraft): PollDraft => ({ question: p.question.trim(), multiple: p.multiple, options: p.options.map((o) => o.trim()).filter(Boolean).slice(0, 8), hours: p.hours && p.hours > 0 ? p.hours : undefined });
