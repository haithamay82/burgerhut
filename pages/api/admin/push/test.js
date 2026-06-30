import { sendAdminTestPush } from "@/lib/adminPushNotify";
import { authorizeAdminOrEmployee } from "@/lib/adminAuth";

function authorize(req) {
  return authorizeAdminOrEmployee(req);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }
  const auth = authorize(req);
  if (!auth.ok) {
    if (auth.reason === "not_configured") {
      return res.status(503).json({ ok: false, error: "admin_not_configured" });
    }
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const result = await sendAdminTestPush();
  if (!result.ok) {
    return res.status(result.error === "no_subscriptions" ? 404 : 503).json({
      ok: false,
      error: result.error,
    });
  }

  return res.status(200).json({
    ok: true,
    sent: result.sent,
    failed: result.failed,
    removed: result.removed,
  });
}
