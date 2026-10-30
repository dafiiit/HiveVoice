// All limits in one place. Raise one only with a reason in the commit: they are what stops slow pages and jerky animation.
export const MOTION = {
  cpu: 8, // a Mac at 4 times slower is still faster than a mid-range phone (checked by going up until frames were lost)
  droppedFrames: 2, // frames over 34 ms in one gesture
  worstFrameMs: 67, // two lost frames in a row
  longTaskMs: 100, // a single long animation frame
};
// Slow 4G as Lighthouse measures it, with the CPU of a mid-range phone.
export const SLOW = { latency: 150, down: (1.6 * 1024 * 1024) / 8, up: (750 * 1024) / 8, cpu: 4 };
export const LOAD = { fcpMs: 2000, lcpMs: 3000, blockingMs: 600, tabMs: 1500 };
export const OFFLINE = { keptPageMs: 1000, badNetworkMs: 2500, unknownPageMs: 1500, clickMs: 2000 };
