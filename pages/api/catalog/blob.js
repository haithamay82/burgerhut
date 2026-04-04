import { handleUpload } from "@vercel/blob/client";

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

function getAdminSecret() {
  return String(process.env.ADMIN_ORDERS_SECRET || "");
}

function parsePayload(clientPayload) {
  if (!clientPayload || typeof clientPayload !== "string") return {};
  try {
    return JSON.parse(clientPayload);
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const secret = getAdminSecret();
  if (!secret) {
    return res.status(503).json({ ok: false, error: "admin_not_configured" });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ ok: false, error: "blob_not_configured" });
  }

  try {
    const body =
      req.body && typeof req.body === "object" ? req.body : undefined;

    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const payload = parsePayload(clientPayload);
        if (String(payload.adminSecret || "") !== secret) {
          throw new Error("unauthorized");
        }
        return {
          allowedContentTypes: ALLOWED_IMAGE_TYPES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ area: "catalog-menu-image" }),
        };
      },
      onUploadCompleted: async () => {
        /* URL נשמר בצד הלקוח מתוצאת upload() */
      },
    });

    return res.status(200).json(jsonResponse);
  } catch (err) {
    const msg = String(err?.message || "");
    if (msg.toLowerCase().includes("unauthorized")) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    if (
      msg.includes("BLOB_READ_WRITE_TOKEN") ||
      msg.toLowerCase().includes("blob")
    ) {
      return res.status(503).json({ ok: false, error: "blob_not_configured" });
    }
    return res
      .status(400)
      .json({ ok: false, error: "upload_failed", detail: msg.slice(0, 240) });
  }
}
