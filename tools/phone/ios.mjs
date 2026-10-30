// Films the running iOS Simulator: real Safari, shown on the Mac's graphics. Gestures come from the Simulator tool or the mouse.
//
//   npm run phone:ios -- 6                                     records 6 seconds
//   npm run phone:ios -- 6 https://hive-voice.vercel.app/me    opens the address first
//
// Then look at single frames: npm run phone:frames -- test-results/phone/ios-….mp4
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const [seconds = "6", url] = process.argv.slice(2);
if (url) execFileSync("xcrun", ["simctl", "openurl", "booted", url]);
const dir = path.join("test-results", "phone");
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `ios-${new Date().toISOString().replace(/[:.]/g, "-")}.mp4`);
const recorder = spawn("xcrun", ["simctl", "io", "booted", "recordVideo", "--codec=h264", "--force", file], { stdio: "inherit" });
console.log(`Nimmt ${seconds} s auf …`);
setTimeout(() => recorder.kill("SIGINT"), Number(seconds) * 1000);
recorder.on("exit", () => console.log(file));
