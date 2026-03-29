import { useLocale } from "@/contexts/LocaleContext";

export default function FloatingWhatsAppButton() {
  const { t } = useLocale();

  return (
    <a
      href="https://wa.me/972504847599"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-24 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-2xl text-white shadow-lg shadow-emerald-500/40 hover:bg-emerald-400 md:bottom-8"
      aria-label={t("float.wa")}
    >
      <span aria-hidden>💬</span>
    </a>
  );
}
