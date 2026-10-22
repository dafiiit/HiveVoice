// Stroke icons, square caps, matching the Swiss design.
type P = { size?: number; className?: string };
const base = (size: number) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeLinecap: "square" as const, "aria-hidden": true });

export const IconPin = ({ size = 16, className }: P) => <svg {...base(size)} strokeWidth={2.5} className={className}><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><rect x="10" y="8" width="4" height="4" /></svg>;
export const IconPlus = ({ size = 18, className }: P) => <svg {...base(size)} strokeWidth={2.5} className={className}><path d="M12 4v16M4 12h16" /></svg>;
export const IconSearch = ({ size = 18, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><circle cx="10" cy="10" r="6" /><path d="M15 15l6 6" /></svg>;
export const IconInbox = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><path d="M3 13h5l1 3h6l1-3h5" /><path d="M3 13l3-8h12l3 8v7H3z" /></svg>;
export const IconCheck = ({ size = 14, className }: P) => <svg {...base(size)} strokeWidth={3} className={className}><path d="M4 12l5 5L20 6" /></svg>;
export const IconUp = ({ size = 16, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><path d="M7 11v9H3v-9zM7 11l4-8c1.5 0 2.5 1 2.5 2.5V9H20l-1.5 11H7" /></svg>;
export const IconDown = ({ size = 16, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><path d="M17 13V4h4v9zM17 13l-4 8c-1.5 0-2.5-1-2.5-2.5V15H4l1.5-11H17" /></svg>;
export const IconReply = ({ size = 16, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><path d="M3 5h18v12H9l-5 4v-4H3z" /></svg>;
export const IconLock = ({ size = 16, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><rect x="5" y="11" width="14" height="10" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
export const IconSquare = ({ size = 14, className }: P) => <svg {...base(size)} strokeWidth={2.5} className={className}><rect x="6" y="6" width="12" height="12" /></svg>;
export const IconClose = ({ size = 18, className }: P) => <svg {...base(size)} strokeWidth={2.5} className={className}><path d="M5 5l14 14M19 5L5 19" /></svg>;
export const IconBack = ({ size = 18, className }: P) => <svg {...base(size)} strokeWidth={2.5} className={className}><path d="M15 4l-8 8 8 8" /></svg>;
export const IconCompass = ({ size = 22, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></svg>;
export const IconChat = ({ size = 22, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><path d="M3 4h13v9H8l-4 3v-3H3z" /><path d="M19 9h2v10l-3-2h-7v-2" /></svg>;
export const IconShare = ({ size = 22, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><path d="M12 15V4M7 9l5-5 5 5" /><path d="M4 14v6h16v-6" /></svg>;
export const IconAttach = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><path d="M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7" /></svg>;
export const IconPoll = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><path d="M5 20V10M12 20V4M19 20v-7" /></svg>;
export const IconFile = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></svg>;
export const IconEye = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
export const IconColumns = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><rect x="3" y="4" width="18" height="16" /><path d="M12 4v16" /></svg>;
export const IconImage = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><rect x="3" y="4" width="18" height="16" /><circle cx="9" cy="10" r="2" /><path d="M3 18l6-5 4 3 3-2 5 4" /></svg>;
export const IconFolder = ({ size = 22, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><path d="M3 5h7l2 2h9v12H3z" /><path d="M3 10h18" /></svg>;
// The sections of the three areas (sidebar).
export const IconSidebar = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><rect x="3" y="4" width="18" height="16" /><path d="M10 4v16" /></svg>;
export const IconBoard = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><rect x="3" y="4" width="18" height="16" /><path d="M7 9h6M7 13h10M7 17h4" /></svg>;
export const IconHands = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><path d="M3 12l5-5 4 3 4-3 5 5-9 8z" /><path d="M8 7l4 4" /></svg>;
export const IconUsers = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.5-4 3-6 6.5-6s6 2 6.5 6" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .7 3.2 2.6 3.5 6" /></svg>;
export const IconUser = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><circle cx="12" cy="8" r="4" /><path d="M4 21c.6-4.5 3.8-7 8-7s7.4 2.5 8 7" /></svg>;
export const IconHome = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><path d="M3 11l9-7 9 7v9H3z" /><path d="M9 20v-6h6v6" /></svg>;
export const IconList = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><path d="M4 6h2M4 12h2M4 18h2M10 6h10M10 12h10M10 18h10" /></svg>;
export const IconNote = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><path d="M5 3h10l4 4v14H5z" /><path d="M15 3v4h4M8 12h8M8 16h6" /></svg>;
export const IconDiagram = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><rect x="3" y="3" width="7" height="6" /><rect x="14" y="15" width="7" height="6" /><path d="M6.5 9v8.5H14M17.5 15V6.5H10" /></svg>;
export const IconUpload = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 15v5h16v-5" /></svg>;
export const IconDownload = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 15v5h16v-5" /></svg>;
export const IconFlag = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><path d="M5 21V4" /><path d="M5 4h13l-3 4.5 3 4.5H5" /></svg>;
export const IconMail = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><rect x="3" y="5" width="18" height="14" /><path d="M3 6l9 7 9-7" /></svg>;
// The picture editor.
export const IconPen = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><path d="M4 20l1-5L16 4l4 4L9 19z" /><path d="M13 7l4 4" /></svg>;
export const IconRect = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><rect x="4" y="5" width="16" height="14" /></svg>;
export const IconEllipse = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><ellipse cx="12" cy="12" rx="8.5" ry="7" /></svg>;
export const IconArrow = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><path d="M5 19L19 5M10 5h9v9" /></svg>;
export const IconText = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><path d="M5 7V4h14v3M12 4v16M9 20h6" /></svg>;
export const IconUndo = ({ size = 20, className }: P) => <svg {...base(size)} strokeWidth={2} className={className}><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-4" /></svg>;
