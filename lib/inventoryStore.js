import { promises as fs } from "fs";
import path from "path";
import { kvGetJson, kvSetJson } from "@/lib/kvStore";

const DATA_DIR = path.join(process.cwd(), "data");
const INVENTORY_FILE = path.join(DATA_DIR, "inventory.json");
const KV_KEY = "burgerhut:inventory";

/** @type {string[] | null} */
let memoryUnavailableIds = null;

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(INVENTORY_FILE);
  } catch {
    await fs.writeFile(
      INVENTORY_FILE,
      JSON.stringify({ unavailableIds: [] }, null, 2),
      "utf8"
    );
  }
}

/**
 * @returns {Promise<string[]>}
 */
export async function getUnavailableIds() {
  const fromKv = await kvGetJson(KV_KEY);
  if (fromKv && Array.isArray(fromKv.unavailableIds)) {
    return fromKv.unavailableIds.filter((x) => typeof x === "string");
  }
  try {
    await ensureDataFile();
    const raw = await fs.readFile(INVENTORY_FILE, "utf8");
    const parsed = JSON.parse(raw || "{}");
    const ids = parsed?.unavailableIds;
    return Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
  } catch {
    return memoryUnavailableIds ? [...memoryUnavailableIds] : [];
  }
}

/**
 * @param {string[]} ids
 */
export async function setUnavailableIds(ids) {
  const unique = [...new Set(ids)].filter((x) => typeof x === "string");
  const payload = { unavailableIds: unique };
  const savedToKv = await kvSetJson(KV_KEY, payload);
  if (savedToKv) {
    memoryUnavailableIds = null;
    return;
  }
  try {
    await ensureDataFile();
    await fs.writeFile(INVENTORY_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch {
    memoryUnavailableIds = unique;
  }
}
