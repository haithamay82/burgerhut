import { registerEmployeeAccount } from "@/lib/employeeHoursStore";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const result = await registerEmployeeAccount({
    name: req.body?.name,
    password: req.body?.password,
  });
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error });
  }
  return res.status(200).json({
    ok: true,
    employee: result.employee,
  });
}
