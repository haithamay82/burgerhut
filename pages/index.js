import dynamic from "next/dynamic";
import Layout from "@/components/Layout";
import { getHomeSliderPublic } from "@/lib/homeSliderStore";

const HomeMain = dynamic(() => import("@/components/HomeMain"), {
  ssr: false,
  loading: () => (
    <div
      className="py-16 text-center text-sm text-gray-500"
      role="status"
      dir="rtl"
    >
      טוען…
    </div>
  ),
});

export async function getServerSideProps({ res }) {
  if (res) {
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, max-age=0"
    );
  }
  let initialHomeSliderImages = [];
  let initialSliderVersion = 0;
  try {
    const data = await getHomeSliderPublic();
    if (data?.ok && Array.isArray(data.images)) {
      initialHomeSliderImages = data.images;
      initialSliderVersion = Number(data.version) || 0;
    }
  } catch {
    /* ignore */
  }
  return { props: { initialHomeSliderImages, initialSliderVersion } };
}

export default function HomePage({ initialHomeSliderImages, initialSliderVersion }) {
  return (
    <Layout>
      <HomeMain
        initialHomeSliderImages={initialHomeSliderImages}
        initialSliderVersion={initialSliderVersion}
      />
    </Layout>
  );
}
