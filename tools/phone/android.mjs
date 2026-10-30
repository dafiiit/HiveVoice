// Starts the Android emulator (device "hivevoice", command-line tools only, see docs/debugging.md) and opens an address in Chrome.
//
//   npm run phone:android                                      starts it, or uses the one that is running
//   npm run phone:android -- https://hive-voice.vercel.app/me
//   npm run phone:android -- --stop
//
// Then measure: npm run phone -- --target android --url <address>
import { execFileSync, spawn } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

const sdk = process.env.ANDROID_HOME ?? path.join(homedir(), "Library", "Android", "sdk");
const adb = (...args) => execFileSync(path.join(sdk, "platform-tools", "adb"), args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const attached = () => adb("devices").split("\n").slice(1).some((line) => /\tdevice$/.test(line));
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const arg = process.argv[2];

if (arg === "--stop") {
  if (attached()) adb("emu", "kill");
  process.exit(0);
}
if (!attached()) {
  spawn(path.join(sdk, "emulator", "emulator"), ["-avd", "hivevoice", "-gpu", "host", "-no-snapshot-save", "-no-boot-anim", "-no-audio"], { detached: true, stdio: "ignore" }).unref();
  console.log("Emulator startet …");
}
for (let tries = 0; ; tries++) {
  try { if (attached() && adb("shell", "getprop", "sys.boot_completed") === "1") break; } catch { /* still starting */ }
  if (tries > 90) throw new Error("the emulator did not start within 3 minutes");
  await pause(2000);
}
if (arg) adb("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", arg, "com.android.chrome");
console.log("Bereit.");
