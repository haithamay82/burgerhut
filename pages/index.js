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

export async function getServerSideProps() {
  let initialHomeSliderImages = [];
  try {
    const data = await getHomeSliderPublic();
    if (data?.ok && Array.isArray(data.images) && data.images.length) {
      initialHomeSliderImages = data.images;
    }
  } catch {
    /* ignore */
  }
  return { props: { initialHomeSliderImages } };
}

export default function HomePage({ initialHomeSliderImages }) {
  return (
    <Layout>
      <HomeMain initialHomeSliderImages={initialHomeSliderImages} />
    </Layout>
  );
}
