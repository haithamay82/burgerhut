import { handleUpload } from "@vercel/blob/client";
import { del as deleteBlob } from "@vercel/blob";
import { getPromoMeta, setPromoMeta } from "@/lib/promoStore";

const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export const config = {
  api: {
    bodyParser: false,
  },
};

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

  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const payload = parsePayload(clientPayload);
        if (String(payload.adminSecret || "") !== secret) {
          throw new Error("unauthorized");
        }
        return {
          allowedContentTypes: ALLOWED_VIDEO_TYPES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ area: "promo-video" }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        const nextUrl = String(blob?.url || "");
        const prev = await getPromoMeta();
        const prevUrl = String(prev?.externalUrl || "");

        if (prevUrl && prevUrl !== nextUrl) {
          try {
            await deleteBlob(prevUrl);
          } catch {
            // Keep flow resilient: even if delete fails, keep newest promo active.
          }
        }

        await setPromoMeta({
          enabled: true,
          filename: null,
          externalUrl: nextUrl,
        });
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
    return res.status(400).json({ ok: false, error: "upload_failed" });
  }
}
