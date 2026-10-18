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
