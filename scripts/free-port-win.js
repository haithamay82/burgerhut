/**
 * משחרר את פורט 3000 ב-Windows (taskkill) כדי שאפשר יהיה למחוק את .next.
 * לא מתקין חבילות — רק netstat + taskkill.
 */
const { execSync } = require("child_process");
const os = require("os");

if (os.platform() !== "win32") {
  console.log("free-port-win: skipped (not Windows)");
  process.exit(0);
}

const PORT = process.env.FREE_PORT || "3000";

let out = "";
try {
  out = execSync(`netstat -ano`, { encoding: "utf8" });
} catch {
  process.exit(0);
}

const pids = new Set();
for (const line of out.split(/\r?\n/)) {
  if (!line.includes(`:${PORT}`) || !line.includes("LISTENING")) continue;
  const parts = line.trim().split(/\s+/).filter(Boolean);
  const pid = parts[parts.length - 1];
  if (/^\d+$/.test(pid)) pids.add(pid);
}

if (!pids.size) {
  console.log(`free-port-win: nothing listening on port ${PORT}`);
  process.exit(0);
}

for (const pid of pids) {
  try {
    console.log(`free-port-win: stopping PID ${pid} (port ${PORT})`);
    execSync(`taskkill /PID ${pid} /F`, { stdio: "inherit" });
  } catch {
    /* process may have exited */
  }
}
