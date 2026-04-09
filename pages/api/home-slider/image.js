import { getSliderUploadIfListed } from "@/lib/homeSliderStore";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }
  const id = String(req.query?.id || "").trim().toLowerCase();
  const data = await getSliderUploadIfListed(id);
  if (!data?.buffer?.length) {
    return res.status(404).end();
  }
  res.setHeader("Content-Type", data.mime || "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=86400");
  return res.status(200).send(data.buffer);
}
