import { promises as fs } from "fs";
import path from "path";
import { kvGetJson, kvSetJson } from "@/lib/kvStore";
import { emptyCatalogEditor } from "@/utils/mergeMenuCatalog";

const DATA_DIR = path.join(process.cwd(), "data");
const CATALOG_FILE = path.join(DATA_DIR, "catalog.json");
const KV_KEY = "burgerhut:catalog";

/** @type {object | null} */
let memoryCatalog = null;

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(CATALOG_FILE);
  } catch {
    await fs.writeFile(
      CATALOG_FILE,
      JSON.stringify(emptyCatalogEditor(), null, 2),
      "utf8"
    );
  }
}

/**
 * @returns {Promise<object>}
 */
export async function getCatalogEditor() {
  const fromKv = await kvGetJson(KV_KEY);
  if (fromKv && typeof fromKv === "object") {
    return {
      ...emptyCatalogEditor(),
      ...fromKv,
    };
  }
  try {
    await ensureDataFile();
    const raw = await fs.readFile(CATALOG_FILE, "utf8");
    const parsed = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object") {
      return { ...emptyCatalogEditor(), ...parsed };
    }
  } catch {
    if (memoryCatalog && typeof memoryCatalog === "object") {
      return { ...emptyCatalogEditor(), ...memoryCatalog };
    }
  }
  return emptyCatalogEditor();
}

/**
 * @param {object} editor
 */
export async function setCatalogEditor(editor) {
  const payload = editor && typeof editor === "object" ? editor : emptyCatalogEditor();
  const savedToKv = await kvSetJson(KV_KEY, payload);
  if (savedToKv) {
    memoryCatalog = null;
    return;
  }
  try {
    await ensureDataFile();
    await fs.writeFile(CATALOG_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch {
    memoryCatalog = payload;
  }
}
