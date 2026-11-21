import { promises as fs } from "fs";
import path from "path";
import { isKvEnabled, kvGetJson, kvSetJson } from "@/lib/kvStore";

const KV_KEY = "burgerhut:snake-challenge";
const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "snake-challenge.json");

/** @type {{ winners: number } | null} */
let memory = null;

function normalize(raw) {
  const n = Number(raw?.winners);
  return { winners: Number.isFinite(n) && n > 0 ? Math.floor(n) : 0 };
}

async function loadFromFile() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
    return normalize(raw);
  } catch {
    return null;
  }
}

async function saveToFile(data) {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

export async function getSnakeChallengeWinners() {
  if (isKvEnabled()) {
    const fromKv = await kvGetJson(KV_KEY);
    if (fromKv && typeof fromKv === "object") {
      const n = normalize(fromKv);
      memory = n;
      return n.winners;
    }
  }
  const fromFile = await loadFromFile();
  if (fromFile) {
    memory = fromFile;
    return fromFile.winners;
  }
  return memory?.winners || 0;
}

export async function incrementSnakeChallengeWinners() {
  const current = await getSnakeChallengeWinners();
  const next = { winners: current + 1 };
  memory = next;
  if (isKvEnabled()) {
    const ok = await kvSetJson(KV_KEY, next);
    if (ok) return next.winners;
  }
  await saveToFile(next);
  return next.winners;
}
