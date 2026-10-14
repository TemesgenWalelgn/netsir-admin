"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  Timestamp,
  updateDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Flag,
  Loader2,
  RefreshCw,
  AlertCircle,
  Music2,
  ExternalLink,
  Pencil,
  Save,
  Trash2,
  X,
} from "lucide-react";

import { auth, db } from "@/lib/firebase";

type SongReport = {
  id: string;
  songId: string;
  stableSongId: string;
  songFirestoreId: string;
  songTitle: string;
  songCategory: string;
  songLyrics: string;
  songYoutubeUrl: string;
  isUserCreated: boolean;
  reportType: string;
  description: string;
  reporterUid: string;
  status: string;
  createdAt: Timestamp | null;
  resolvedAt: Timestamp | null;
};

type SongEditForm = {
  title: string;
  lyrics: string;
  category: string;
  youtubeUrl: string;
};

const reportLabels: Record<string, string> = {
  "የተሳሳተ ግጥም": "Incorrect lyrics",
  "የፊደል ስህተት": "Spelling mistake",
  "የተሳሳተ ርዕስ": "Incorrect title",
  "የተሳሳተ ምድብ": "Incorrect category",
  "የድምፅ ሊንክ ችግር": "Audio link problem",
  "ሌላ ችግር": "Other issue",
};

export default function ReportsPage() {
  const router = useRouter();

  const [reports, setReports] = useState<SongReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [savingSong, setSavingSong] = useState(false);
  const [editingReport, setEditingReport] =
    useState<SongReport | null>(null);

  const [editForm, setEditForm] = useState<SongEditForm>({
    title: "",
    lyrics: "",
    category: "",
    youtubeUrl: "",
  });

  const [filter, setFilter] = useState<"pending" | "resolved" | "all">(
    "pending"
  );

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // ----------------------------------------------------
  // LOAD REPORTS
  // ----------------------------------------------------

  const loadReports = useCallback(
    async (user?: User | null, isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");
      setSuccess("");

      try {
        const currentUser = user ?? auth.currentUser;

        if (!currentUser) {
          router.replace("/");
          return;
        }

        const adminSnapshot = await getDoc(
          doc(db, "admins", currentUser.uid)
        );

        if (
          !adminSnapshot.exists() ||
          adminSnapshot.data()?.role !== "admin"
        ) {
          router.replace("/");
          return;
        }

        const snapshot = await getDocs(
          collection(db, "song_reports")
        );

        const loadedReports: SongReport[] = snapshot.docs.map(
          (reportDoc) => {
            const data = reportDoc.data();

            return {
              id: reportDoc.id,
              songId: String(data.songId ?? ""),
              stableSongId: String(data.stableSongId ?? ""),
              songFirestoreId: String(data.songFirestoreId ?? ""),
              songTitle: data.songTitle || "Untitled Song",
              songCategory: data.songCategory || "Uncategorized",
              songLyrics: data.songLyrics || "",
              songYoutubeUrl: data.songYoutubeUrl || "",
              isUserCreated: data.isUserCreated === true,
              reportType: data.reportType || "Unspecified issue",
              description: data.description || "",
              reporterUid: data.reporterUid || "",
              status: data.status || "pending",
              createdAt:
                data.createdAt instanceof Timestamp
                  ? data.createdAt
                  : null,
              resolvedAt:
                data.resolvedAt instanceof Timestamp
                  ? data.resolvedAt
                  : null,
            };
          }
        );

        loadedReports.sort((a, b) => {
          const aTime = a.createdAt?.toMillis() ?? 0;
          const bTime = b.createdAt?.toMillis() ?? 0;
          return bTime - aTime;
        });

        setReports(loadedReports);
      } catch (err) {
        console.error("Reports loading error:", err);
        setError(
          "Unable to load reports. Check your permissions and try again."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [router]
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/");
        return;
      }

      void loadReports(user);
    });

    return () => unsubscribe();
  }, [loadReports, router]);

  // ----------------------------------------------------
  // DELETE REPORT
  // Deletes the report only, not the original song.
  // ----------------------------------------------------

  async function deleteReport(report: SongReport) {
    if (deletingId || savingSong) return;

    const confirmed = window.confirm(
      `Delete this report for "${report.songTitle}"?\n\nThis will permanently remove the report only. The song itself will not be deleted.`
    );

    if (!confirmed) return;

    setDeletingId(report.id);
    setError("");
    setSuccess("");

    try {
      const user = auth.currentUser;

      if (!user) {
        setError("Please sign in again.");
        return;
      }

      // Verify that the current user is still an administrator.
      const adminSnapshot = await getDoc(
        doc(db, "admins", user.uid)
      );

      if (
        !adminSnapshot.exists() ||
        adminSnapshot.data()?.role !== "admin"
      ) {
        setError("Only an administrator can delete reports.");
        router.replace("/");
        return;
      }

      // Delete only the selected report document.
      await deleteDoc(
        doc(db, "song_reports", report.id)
      );

      // Remove the deleted report from the current page.
      setReports((previous) =>
        previous.filter((item) => item.id !== report.id)
      );

      if (editingReport?.id === report.id) {
        setEditingReport(null);
        setEditForm({
          title: "",
          lyrics: "",
          category: "",
          youtubeUrl: "",
        });
      }

      setSuccess(
        "Report deleted. The song itself was not changed."
      );
    } catch (err) {
      console.error("Deleting report error:", err);

      setError(
        "Unable to delete this report. Check your Firestore permissions and try again."
      );
    } finally {
      setDeletingId("");
    }
  }

  // ----------------------------------------------------
  // SONG EDITOR
  // ----------------------------------------------------

  function openSongEditor(report: SongReport) {
    setError("");
    setSuccess("");
    setEditingReport(report);

    setEditForm({
      title: report.songTitle,
      lyrics: report.songLyrics,
      category:
        report.songCategory === "Uncategorized"
          ? ""
          : report.songCategory,
      youtubeUrl: report.songYoutubeUrl,
    });
  }

  function closeSongEditor() {
    if (savingSong) return;

    setEditingReport(null);

    setEditForm({
      title: "",
      lyrics: "",
      category: "",
      youtubeUrl: "",
    });
  }

  // ----------------------------------------------------
  // SAVE SONG CORRECTIONS
  // ----------------------------------------------------

  async function saveSongChanges() {
    if (!editingReport) return;

    const user = auth.currentUser;

    if (!user) {
      setError("Please sign in again.");
      return;
    }

    if (!editingReport.songId.trim()) {
      setError(
        "This report does not contain a song ID, so the original song cannot be located."
      );
      return;
    }

    if (!editForm.title.trim()) {
      setError("Song title is required.");
      return;
    }

    if (!editForm.lyrics.trim()) {
      setError("Song lyrics cannot be empty.");
      return;
    }

    if (!editForm.category.trim()) {
      setError("Song category is required.");
      return;
    }

    setSavingSong(true);
    setError("");
    setSuccess("");

    try {
      const title = editForm.title.trim();
      const lyrics = editForm.lyrics.trim();
      const category = editForm.category.trim();
      const youtubeUrl = editForm.youtubeUrl.trim();

      if (!editingReport.isUserCreated) {
        // Built-in songs are stored in SQLite.
        // Save the correction record to Firestore.
        const rawLocalId = Number(editingReport.songId);

        const stableSongId = editingReport.stableSongId.trim()
          ? editingReport.stableSongId.trim()
          : Number.isSafeInteger(rawLocalId) && rawLocalId > 0
            ? `builtin_${rawLocalId}`
            : "";

        if (!stableSongId) {
          throw new Error("MISSING_STABLE_SONG_ID");
        }

        await setDoc(
          doc(db, "song_corrections", stableSongId),
          {
            stableSongId,
            ...(Number.isSafeInteger(rawLocalId) && rawLocalId > 0
              ? { localSongId: rawLocalId }
              : {}),
            title,
            lyrics,
            category,
            youtubeUrl,
            isBuiltIn: true,
            updatedBy: user.uid,
            updatedAt: serverTimestamp(),
            sourceReportId: editingReport.id,
          },
          { merge: true }
        );
      } else {
        // Prefer the Firestore document ID supplied by the app.
        const sharedSongDocumentId =
          editingReport.songFirestoreId.trim() ||
          editingReport.songId.trim();

        if (!sharedSongDocumentId) {
          throw new Error("MISSING_SHARED_SONG_ID");
        }

        const songRef = doc(
          db,
          "shared_songs",
          sharedSongDocumentId
        );

        const songSnapshot = await getDoc(songRef);

        if (!songSnapshot.exists()) {
          throw new Error("SONG_DOCUMENT_NOT_FOUND");
        }

        await updateDoc(songRef, {
          title,
          lyrics,
          category,
          youtubeUrl,
          updatedAt: serverTimestamp(),
        });
      }

      setReports((previous) =>
        previous.map((report) =>
          report.id === editingReport.id
            ? {
                ...report,
                songTitle: title,
                songCategory: category,
                songLyrics: lyrics,
                songYoutubeUrl: youtubeUrl,
              }
            : report
        )
      );

      setEditingReport(null);

      setSuccess(
        editingReport.isUserCreated
          ? "Shared song updated successfully. You can now resolve the report."
          : "Built-in song correction published. The app can apply it the next time it synchronizes, provided the report's stable ID matches the local song."
      );
    } catch (err) {
      console.error("Song update error:", err);

      if (
        err instanceof Error &&
        err.message === "MISSING_STABLE_SONG_ID"
      ) {
        setError(
          "This built-in report has no usable song identifier. Please update the app to include stableSongId when submitting reports."
        );
      } else if (
        err instanceof Error &&
        err.message === "MISSING_SHARED_SONG_ID"
      ) {
        setError(
          "This shared-song report does not contain a valid Firestore document ID."
        );
      } else if (
        err instanceof Error &&
        err.message === "SONG_DOCUMENT_NOT_FOUND"
      ) {
        setError(
          "The shared song was not found. This report may contain a local SQLite ID instead of the shared_songs Firestore document ID."
        );
      } else {
        setError(
          "Unable to save the correction. Check your Firestore permissions and try again."
        );
      }
    } finally {
      setSavingSong(false);
    }
  }

  // ----------------------------------------------------
  // RESOLVE REPORT
  // ----------------------------------------------------

  async function markResolved(report: SongReport) {
    const user = auth.currentUser;

    if (!user || report.status === "resolved") return;

    setUpdatingId(report.id);
    setError("");
    setSuccess("");

    try {
      await updateDoc(
        doc(db, "song_reports", report.id),
        {
          status: "resolved",
          resolvedAt: serverTimestamp(),
          resolvedBy: user.uid,
        }
      );

      setReports((previous) =>
        previous.map((item) =>
          item.id === report.id
            ? {
                ...item,
                status: "resolved",
                resolvedAt: Timestamp.now(),
              }
            : item
        )
      );

      setSuccess("Report marked as resolved.");
    } catch (err) {
      console.error("Resolving report error:", err);

      setError(
        "Unable to resolve this report. Check your Firestore permissions and try again."
      );
    } finally {
      setUpdatingId("");
    }
  }

  // ----------------------------------------------------
  // HELPERS
  // ----------------------------------------------------

  function formatDate(date: Timestamp | null) {
    if (!date) return "Waiting for timestamp";

    return date.toDate().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  const pendingCount = reports.filter(
    (report) => report.status === "pending"
  ).length;

  const resolvedCount = reports.filter(
    (report) => report.status === "resolved"
  ).length;

  const visibleReports = reports.filter((report) => {
    if (filter === "all") return true;
    return report.status === filter;
  });

  // ----------------------------------------------------
  // LOADING
  // ----------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-40 animate-pulse rounded-2xl bg-white" />
        <div className="h-64 animate-pulse rounded-2xl bg-white" />
      </div>
    );
  }

  // ----------------------------------------------------
  // PAGE
  // ----------------------------------------------------

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Link
            href="/dashboard"
            className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-emerald-600"
          >
            <ArrowLeft size={16} />
            Back to dashboard
          </Link>

          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-red-600">
            <Flag size={17} />
            Song Management
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Song Reports
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Review reports, correct songs, and mark issues as resolved.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadReports(auth.currentUser, true)}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw
            size={16}
            className={refreshing ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </section>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            Total Reports
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {reports.length}
          </p>
        </div>

        <div className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-red-600">
            Pending
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {pendingCount}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-emerald-600">
            Resolved
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {resolvedCount}
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
          <div>
            <h2 className="font-semibold text-slate-900">
              Submitted Reports
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Edit the song before resolving the report.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(["pending", "resolved", "all"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize transition ${
                  filter === value
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {value === "all" ? "All" : value}
              </button>
            ))}
          </div>
        </div>

        {visibleReports.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <CheckCircle2 size={23} />
            </div>

            <p className="font-medium text-slate-700">
              {filter === "pending"
                ? "No pending reports"
                : "No reports found"}
            </p>

            <p className="mt-1 text-sm text-slate-400">
              {filter === "pending"
                ? "You're all caught up."
                : "Reports will appear here when users submit them."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleReports.map((report) => (
              <article key={report.id} className="p-5 sm:p-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          report.status === "resolved"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        {report.status === "resolved" ? (
                          <CheckCircle2 size={13} />
                        ) : (
                          <Clock3 size={13} />
                        )}
                        {report.status === "resolved"
                          ? "Resolved"
                          : "Pending"}
                      </span>

                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        {reportLabels[report.reportType] ||
                          report.reportType}
                      </span>
                    </div>

                    <h3 className="mt-3 break-words text-lg font-semibold text-slate-900">
                      {report.songTitle}
                    </h3>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="rounded-md bg-slate-100 px-2 py-1">
                        {report.songCategory}
                      </span>

                      <span
                        className={`rounded-md px-2 py-1 ${
                          report.isUserCreated
                            ? "bg-blue-50 text-blue-700"
                            : "bg-purple-50 text-purple-700"
                        }`}
                      >
                        {report.isUserCreated
                          ? "User-created song"
                          : "Built-in song"}
                      </span>

                      <span className="flex items-center gap-1">
                        <Clock3 size={12} />
                        {formatDate(report.createdAt)}
                      </span>
                    </div>

                    {report.description && (
                      <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/60 p-4">
                        <p className="text-xs font-semibold text-amber-800">
                          User description
                        </p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                          {report.description}
                        </p>
                      </div>
                    )}

                    {report.songLyrics && (
                      <details className="mt-4">
                        <summary className="cursor-pointer text-sm font-medium text-slate-600 hover:text-emerald-600">
                          View reported song lyrics
                        </summary>
                        <p className="mt-3 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                          {report.songLyrics}
                        </p>
                      </details>
                    )}

                    {report.songYoutubeUrl && (
                      <a
                        href={report.songYoutubeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700"
                      >
                        <Music2 size={15} />
                        Open song audio
                        <ExternalLink size={13} />
                      </a>
                    )}

                    {report.status === "resolved" &&
                      report.resolvedAt && (
                        <p className="mt-3 text-xs text-emerald-600">
                          Resolved on {formatDate(report.resolvedAt)}
                        </p>
                      )}
                  </div>

                  <div className="flex shrink-0 flex-col gap-2 sm:pt-1">
                    <button
                      type="button"
                      onClick={() => openSongEditor(report)}
                      disabled={
                        (!report.songId.trim() &&
                          !report.stableSongId.trim()) ||
                        deletingId === report.id
                      }
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                    >
                      <Pencil size={16} />
                      Edit song
                    </button>

                    {report.status !== "resolved" && (
                      <button
                        type="button"
                        onClick={() => void markResolved(report)}
                        disabled={
                          updatingId === report.id ||
                          deletingId === report.id
                        }
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                      >
                        {updatingId === report.id ? (
                          <Loader2
                            size={16}
                            className="animate-spin"
                          />
                        ) : (
                          <CheckCircle2 size={16} />
                        )}
                        Mark resolved
                      </button>
                    )}

                    {/* ADDED: DELETE REPORT BUTTON */}
                    <button
                      type="button"
                      onClick={() => void deleteReport(report)}
                      disabled={deletingId === report.id || savingSong}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    >
                      {deletingId === report.id ? (
                        <Loader2
                          size={16}
                          className="animate-spin"
                        />
                      ) : (
                        <Trash2 size={16} />
                      )}
                      {deletingId === report.id
                        ? "Deleting..."
                        : "Delete report"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ------------------------------------------------
          SONG EDITOR MODAL
      ------------------------------------------------ */}

      {editingReport && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm sm:items-center">
          <div className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Edit Song
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  {editingReport.isUserCreated
                    ? "Changes are saved to the original shared song."
                    : "Changes are published as a correction for the built-in song."}
                </p>
              </div>

              <button
                type="button"
                onClick={closeSongEditor}
                disabled={savingSong}
                aria-label="Close editor"
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            <div className="max-h-[75vh] space-y-5 overflow-y-auto p-5 sm:p-6">
              <div>
                <label
                  htmlFor="song-title"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Song title
                </label>

                <input
                  id="song-title"
                  type="text"
                  value={editForm.title}
                  onChange={(event) =>
                    setEditForm((previous) => ({
                      ...previous,
                      title: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  placeholder="Enter song title"
                />
              </div>

              <div>
                <label
                  htmlFor="song-category"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Category
                </label>

                <input
                  id="song-category"
                  type="text"
                  value={editForm.category}
                  onChange={(event) =>
                    setEditForm((previous) => ({
                      ...previous,
                      category: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  placeholder="Enter song category"
                />
              </div>

              <div>
                <label
                  htmlFor="song-lyrics"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Lyrics
                </label>

                <textarea
                  id="song-lyrics"
                  value={editForm.lyrics}
                  onChange={(event) =>
                    setEditForm((previous) => ({
                      ...previous,
                      lyrics: event.target.value,
                    }))
                  }
                  rows={10}
                  className="w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm leading-7 text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  placeholder="Edit the song lyrics"
                />
              </div>

              <div>
                <label
                  htmlFor="song-youtube"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  YouTube audio URL
                </label>

                <input
                  id="song-youtube"
                  type="url"
                  value={editForm.youtubeUrl}
                  onChange={(event) =>
                    setEditForm((previous) => ({
                      ...previous,
                      youtubeUrl: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  placeholder="https://www.youtube.com/watch?v=..."
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle
                    size={17}
                    className="mt-0.5 shrink-0"
                  />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button
                type="button"
                onClick={closeSongEditor}
                disabled={savingSong}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => void saveSongChanges()}
                disabled={savingSong}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingSong ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                {savingSong ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}