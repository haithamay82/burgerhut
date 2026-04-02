import dynamic from "next/dynamic";
import Layout from "@/components/Layout";

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

export default function HomePage() {
  return (
    <Layout>
      <HomeMain />
    </Layout>
  );
}
