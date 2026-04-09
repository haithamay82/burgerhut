import { useEffect, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useLocale } from "@/contexts/LocaleContext";
import {
  readPersistedAdminSecret,
  writePersistedAdminSecret,
  resolveAdminSecret,
} from "@/utils/adminSecretPersist";
import {
  prepareSliderImageForUpload,
  blobToBase64PngOrJpeg,
} from "@/utils/prepareSliderImageForUpload";

function sliderUploadFetchSignal() {
  if (
    typeof AbortSignal !== "undefined" &&
    typeof AbortSignal.timeout === "function"
  ) {
    return AbortSignal.timeout(90000);
  }
  return undefined;
}

export default function AdminSliderUploadPage() {
  const { t } = useLocale();
  const [secret, setSecret] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const s = readPersistedAdminSecret();
    if (s) setSecret(s);
  }, []);

  const runUpload = async () => {
    const adminSecret = resolveAdminSecret(secret);
    if (!adminSecret) {
      setErr(t("admin.sliderUploadLiteNeedSecret"));
      return;
    }
    if (!secret.trim() && adminSecret) setSecret(adminSecret);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setErr(t("admin.sliderErrMissing"));
      return;
    }
    setErr("");
    setMsg("");
    setUploading(true);
    try {
      const prepared = await prepareSliderImageForUpload(file);
      const imageBase64 = await blobToBase64PngOrJpeg(prepared);
      const r = await fetch("/api/home-slider/upload-b64", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({ imageBase64 }),
        signal: sliderUploadFetchSignal(),
        credentials: "same-origin",
        cache: "no-store",
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.ok) {
        if (d?.error === "slider_upload_requires_kv") {
          setErr(t("admin.sliderUploadRequiresKv"));
        } else if (d?.error === "file_too_large" || r.status === 413) {
          setErr(t("admin.sliderUploadTooLarge"));
        } else if (d?.error === "slider_max_images") {
          setErr(t("admin.sliderMaxImages"));
        } else if (d?.error === "invalid_image") {
          setErr(t("admin.sliderUploadInvalidImage"));
        } else {
          setErr(t("admin.sliderUploadFailed"));
        }
        return;
      }
      writePersistedAdminSecret(adminSecret);
      if (fileRef.current) fileRef.current.value = "";
      setMsg(t("admin.sliderUploadedKv"));
    } catch {
      setErr(t("admin.errNet"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Head>
        <title>{t("admin.sliderUploadLiteTitle")}</title>
      </Head>
      <div className="min-h-screen bg-black px-4 py-8 text-gray-100" dir="rtl">
        <div className="mx-auto max-w-md space-y-4">
          <h1 className="text-lg font-bold text-primary">
            {t("admin.sliderUploadLiteTitle")}
          </h1>
          <p className="text-xs leading-relaxed text-gray-400">
            {t("admin.sliderUploadLiteHint")}
          </p>
          <Link
            href="/admin/orders"
            className="inline-block text-xs font-semibold text-primary underline-offset-2 hover:underline"
          >
            {t("admin.sliderUploadLiteBack")}
          </Link>
          <div>
            <label className="mb-1 block text-xs text-gray-400">
              {t("admin.secretLabel")}
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              disabled={uploading}
              className="max-w-full text-xs text-gray-400 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-gray-200"
            />
          </div>
          <button
            type="button"
            onClick={() => void runUpload()}
            disabled={uploading}
            className="btn-primary w-full text-sm disabled:opacity-50"
          >
            {uploading
              ? t("admin.sliderUploadingKv")
              : t("admin.sliderUploadPhoneBtn")}
          </button>
          {err ? <p className="text-sm text-red-300">{err}</p> : null}
          {msg ? (
            <p className="text-sm font-medium text-emerald-400/95">{msg}</p>
          ) : null}
        </div>
      </div>
    </>
  );
}
