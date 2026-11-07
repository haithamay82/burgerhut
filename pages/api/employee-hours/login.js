import { loginEmployeeAccount } from "@/lib/employeeHoursStore";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const result = await loginEmployeeAccount(req.body?.password);
  if (!result.ok) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  return res.status(200).json({
    ok: true,
    employee: result.employee,
  });
}
