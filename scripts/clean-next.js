const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const nextDir = path.join(root, ".next");
const cacheDir = path.join(root, "node_modules", ".cache");

function rmDir(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
    console.log("removed:", p);
    return true;
  } catch (e) {
    if (e.code === "ENOENT") return true;
    console.warn("rm failed:", p, e.message);
    return false;
  }
}

/** Next.js / כלים לפעמים נועלים רק את קובץ trace — מוחקים לפני rm של כל .next */
function tryRemoveNextTraceLocks(nextPath) {
  const candidates = ["trace", "trace-build"];
  for (const name of candidates) {
    const f = path.join(nextPath, name);
    try {
      fs.unlinkSync(f);
      console.log("removed:", f);
    } catch (e) {
      if (e.code !== "ENOENT") {
        console.warn("unlink failed:", f, e.message);
      }
    }
  }
}

/** מחיקת תיקיות .next-quarantine-* ישנות (אם נשארו מריצה קודמת) */
function rmOldQuarantine() {
  try {
    const names = fs.readdirSync(root);
    for (const name of names) {
      if (!name.startsWith(".next-quarantine-")) continue;
      const full = path.join(root, name);
      try {
        if (fs.statSync(full).isDirectory()) {
          fs.rmSync(full, { recursive: true, force: true });
          console.log("removed old quarantine:", name);
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

function removeNextDir() {
  if (!fs.existsSync(nextDir)) {
    console.log("no .next folder (already clean)");
    return;
  }
  tryRemoveNextTraceLocks(nextDir);
  if (rmDir(nextDir)) return;

  const quarantine = path.join(root, `.next-quarantine-${Date.now()}`);
  try {
    fs.renameSync(nextDir, quarantine);
    console.log(
      "renamed locked .next →",
      path.basename(quarantine),
      "(stop dev server next time so delete can succeed; you may delete that folder manually)"
    );
  } catch (e) {
    console.error("");
    console.error("Cannot remove or rename .next:", e.message);
    console.error("");
    console.error("Do this:");
    console.error("  1. Stop Next.js (Ctrl+C in the terminal running dev/start).");
    console.error("  2. Close browser tabs on localhost:3000.");
    console.error("  3. Run: npm run clean");
    console.error("");
    process.exit(1);
  }
}

rmOldQuarantine();
removeNextDir();
rmDir(cacheDir);
