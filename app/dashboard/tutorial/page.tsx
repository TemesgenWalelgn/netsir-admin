"use client";

import { FormEvent, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Save,
  Video,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { auth, db } from "@/lib/firebase";

type TutorialSettings = {
  enabled: boolean;
  title: string;
  description: string;
  youtubeUrl: string;
};

const DEFAULT_SETTINGS: TutorialSettings = {
  enabled: true,
  title: "How to Use Netsir",
  description:
    "Watch this tutorial to learn how to use the Netsir app and explore its features.",
  youtubeUrl: "",
};

function extractYouTubeId(value: string): string | null {
  const input = value.trim();
  if (!input) return null;

  // Accept a bare 11-character YouTube video ID.
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;

  try {
    const url = new URL(input.includes("://") ? input : `https://${input}`);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    let id = "";

    if (host === "youtu.be") {
      id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } else if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com" ||
      host === "youtube-nocookie.com"
    ) {
      if (url.pathname === "/watch") {
        id = url.searchParams.get("v") ?? "";
      } else {
        const parts = url.pathname.split("/").filter(Boolean);
        if (["embed", "shorts", "live", "v"].includes(parts[0] ?? "")) {
          id = parts[1] ?? "";
        }
      }
    }

    return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export default function TutorialSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<TutorialSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace("/");
        return;
      }

      try {
        const adminSnapshot = await getDoc(doc(db, "admins", currentUser.uid));
        if (!adminSnapshot.exists() || adminSnapshot.data()?.role !== "admin") {
          router.replace("/");
          return;
        }

        const tutorialSnapshot = await getDoc(doc(db, "settings", "tutorial"));
        if (!active) return;

        setUser(currentUser);
        if (tutorialSnapshot.exists()) {
          const data = tutorialSnapshot.data();
          setSettings({
            enabled: data.enabled === true,
            title:
              typeof data.title === "string" ? data.title : DEFAULT_SETTINGS.title,
            description:
              typeof data.description === "string"
                ? data.description
                : DEFAULT_SETTINGS.description,
            youtubeUrl:
              typeof data.youtubeUrl === "string" ? data.youtubeUrl : "",
          });
        } else {
          setSettings(DEFAULT_SETTINGS);
        }
      } catch (err) {
        console.error("Failed to load tutorial settings:", err);
        if (active) setError("Unable to load tutorial settings. Check your connection and Firestore permissions.");
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);

  const videoId = extractYouTubeId(settings.youtubeUrl);

  function updateField<K extends keyof TutorialSettings>(
    field: K,
    value: TutorialSettings[K]
  ) {
    setSettings((previous) => ({ ...previous, [field]: value }));
    setSuccess("");
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!user) {
      setError("Your admin session has expired. Please sign in again.");
      return;
    }

    if (settings.youtubeUrl.trim() && !videoId) {
      setError("Enter a valid YouTube video URL or an 11-character video ID.");
      return;
    }

    setSaving(true);
    try {
      const adminSnapshot = await getDoc(doc(db, "admins", user.uid));
      if (!adminSnapshot.exists() || adminSnapshot.data()?.role !== "admin") {
        setError("You do not have permission to update tutorial settings.");
        router.replace("/");
        return;
      }

      await setDoc(
        doc(db, "settings", "tutorial"),
        {
          enabled: settings.enabled,
          title: settings.title.trim() || DEFAULT_SETTINGS.title,
          description: settings.description.trim(),
          youtubeUrl: settings.youtubeUrl.trim(),
          updatedAt: serverTimestamp(),
          updatedByUid: user.uid,
        },
        { merge: true }
      );

      setSuccess("Tutorial settings saved successfully.");
    } catch (err) {
      console.error("Failed to save tutorial settings:", err);
      setError("Unable to save tutorial settings. Check your Firestore rules and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-500">
        <Loader2 className="animate-spin" size={20} /> Loading tutorial settings...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-600">
            <Video size={17} /> App Tutorial
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Tutorial Settings
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Manage the tutorial shown on the Netsir app About page.
          </p>
        </div>
        <span
          className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
            settings.enabled
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {settings.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
          {settings.enabled ? "Tutorial enabled" : "Tutorial hidden"}
        </span>
      </header>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 shrink-0" size={18} /> <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 shrink-0" size={18} /> <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="grid gap-6 xl:grid-cols-5">
        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 xl:col-span-3">
          <div>
            <h2 className="font-semibold text-slate-900">Tutorial content</h2>
            <p className="mt-1 text-sm text-slate-500">
              These details are loaded by the mobile app from Firestore.
            </p>
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
            <span>
              <span className="block text-sm font-semibold text-slate-800">Show tutorial in the app</span>
              <span className="mt-1 block text-xs text-slate-500">
                Turn this off to hide the tutorial section on the About page.
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) => updateField("enabled", event.target.checked)}
              className="h-5 w-5 accent-emerald-600"
            />
          </label>

          <div className="space-y-2">
            <label htmlFor="tutorial-title" className="text-sm font-medium text-slate-700">Tutorial title</label>
            <input
              id="tutorial-title"
              value={settings.title}
              onChange={(event) => updateField("title", event.target.value)}
              maxLength={120}
              placeholder="How to Use Netsir"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="tutorial-description" className="text-sm font-medium text-slate-700">Description</label>
            <textarea
              id="tutorial-description"
              value={settings.description}
              onChange={(event) => updateField("description", event.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Briefly explain what users will learn."
              className="w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="tutorial-url" className="text-sm font-medium text-slate-700">YouTube video URL or ID</label>
            <input
              id="tutorial-url"
              value={settings.youtubeUrl}
              onChange={(event) => updateField("youtubeUrl", event.target.value)}
              placeholder="https://www.youtube.com/watch?v=XXXXXXXXXXX"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50"
            />
            <p className="text-xs text-slate-400">Supports watch, youtu.be, shorts, live, embed links, or a video ID.</p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {saving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}
            {saving ? "Saving..." : "Save Tutorial Settings"}
          </button>
        </section>

        <aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 xl:col-span-2">
          <div>
            <h2 className="font-semibold text-slate-900">Video preview</h2>
            <p className="mt-1 text-sm text-slate-500">Preview the video before saving.</p>
          </div>

          {videoId ? (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-black">
              <div className="aspect-video">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${videoId}`}
                  title="Tutorial video preview"
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            </div>
          ) : (
            <div className="flex aspect-video flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 text-center">
              <Video size={32} className="text-slate-400" />
              <p className="mt-3 text-sm font-semibold text-slate-700">No video selected</p>
              <p className="mt-1 text-xs text-slate-500">Paste a valid YouTube link to see the preview.</p>
            </div>
          )}

          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">App display</p>
            <p className="mt-2 font-semibold text-slate-800">{settings.title.trim() || DEFAULT_SETTINGS.title}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{settings.description || "No description added."}</p>
            <p className={`mt-3 text-xs font-medium ${settings.enabled ? "text-emerald-600" : "text-slate-500"}`}>
              {settings.enabled ? "Visible in the app when saved" : "Hidden from the app when saved"}
            </p>
          </div>

          {videoId && (
            <a
              href={`https://www.youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800"
            >
              Open on YouTube <ExternalLink size={15} />
            </a>
          )}
        </aside>
      </form>
    </div>
  );
}
