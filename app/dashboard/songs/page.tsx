
"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";

type Song = {
  id: string;
  title?: string;
  lyrics?: string;
  category?: string;
  youtubeUrl?: string;
  createdAt?: unknown;
};

export default function SongsManagementPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  const [songs, setSongs] = useState<Song[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const [selectedSong, setSelectedSong] = useState<Song | null>(null);

  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editLyrics, setEditLyrics] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editYoutubeUrl, setEditYoutubeUrl] = useState("");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log("SONGS: Auth state:", user?.email);
      console.log("SONGS: UID:", user?.uid);

      if (!user) {
        router.replace("/");
        return;
      }

      try {
        const adminRef = doc(db, "admins", user.uid);
        const adminSnap = await getDoc(adminRef);

        console.log(
          "SONGS: Admin document exists:",
          adminSnap.exists()
        );

        if (!adminSnap.exists()) {
          console.error("SONGS: Admin document not found.");

          setError("You are not authorized to access the Netsir Admin.");
          await signOut(auth);
          router.replace("/");
          return;
        }

        const adminData = adminSnap.data();

        console.log("SONGS: Admin role:", adminData.role);

        if (adminData.role !== "admin") {
          setError("You are not authorized to access the Netsir Admin.");
          await signOut(auth);
          router.replace("/");
          return;
        }

        setAuthorized(true);
        setChecking(false);

        await loadSongs();
      } catch (err) {
        console.error("SONGS: Admin verification failed:", err);

        setError("Unable to verify administrator access.");
        await signOut(auth);
        router.replace("/");
      }
    });

    return () => unsubscribe();
  }, [router]);

  async function loadSongs() {
    setLoading(true);
    setError("");

    try {
      const songsSnapshot = await getDocs(
        collection(db, "shared_songs")
      );

      const loadedSongs: Song[] = songsSnapshot.docs.map((document) => ({
        id: document.id,
        ...(document.data() as Omit<Song, "id">),
      }));

      loadedSongs.sort((a, b) => {
        const aTime = getTimestamp(a.createdAt);
        const bTime = getTimestamp(b.createdAt);

        return bTime - aTime;
      });

      setSongs(loadedSongs);

      setSelectedIds((current) =>
        current.filter((id) =>
          loadedSongs.some((song) => song.id === id)
        )
      );
    } catch (err) {
      console.error("SONGS LOAD FAILED:", err);

      setError(
        "Unable to load songs. Please check your Firebase connection and Firestore permissions."
      );
    } finally {
      setLoading(false);
    }
  }

  function getTimestamp(value: unknown): number {
    if (!value) return 0;

    if (value instanceof Timestamp) {
      return value.toMillis();
    }

    if (
      typeof value === "object" &&
      value !== null &&
      "toMillis" in value &&
      typeof (value as { toMillis?: unknown }).toMillis === "function"
    ) {
      return (value as { toMillis: () => number }).toMillis();
    }

    if (value instanceof Date) {
      return value.getTime();
    }

    if (typeof value === "string") {
      const parsed = new Date(value).getTime();
      return Number.isNaN(parsed) ? 0 : parsed;
    }

    return 0;
  }

  function formatDate(value: unknown): string {
    const timestamp = getTimestamp(value);

    if (!timestamp) {
      return "Not available";
    }

    return new Date(timestamp).toLocaleString();
  }

  const categories = Array.from(
    new Set(
      songs
        .map((song) => song.category?.trim())
        .filter(
          (value): value is string => Boolean(value)
        )
    )
  ).sort();

  const filteredSongs = songs.filter((song) => {
    const query = search.trim().toLowerCase();

    const matchesSearch =
      !query ||
      song.title?.toLowerCase().includes(query) ||
      song.lyrics?.toLowerCase().includes(query) ||
      song.category?.toLowerCase().includes(query);

    const matchesCategory =
      category === "all" ||
      song.category?.trim() === category;

    return matchesSearch && matchesCategory;
  });

  const selectedVisibleCount = filteredSongs.filter((song) =>
    selectedIds.includes(song.id)
  ).length;

  const allVisibleSelected =
    filteredSongs.length > 0 &&
    filteredSongs.every((song) =>
      selectedIds.includes(song.id)
    );

  function toggleSongSelection(songId: string) {
    setSelectedIds((current) => {
      if (current.includes(songId)) {
        return current.filter((id) => id !== songId);
      }

      return [...current, songId];
    });
  }

  function toggleSelectAllVisible() {
    const visibleIds = filteredSongs.map((song) => song.id);

    if (allVisibleSelected) {
      setSelectedIds((current) =>
        current.filter((id) => !visibleIds.includes(id))
      );
      return;
    }

    setSelectedIds((current) => {
      const combined = new Set([
        ...current,
        ...visibleIds,
      ]);

      return Array.from(combined);
    });
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  function openEdit(song: Song) {
    setSelectedSong(null);

    setEditingSong(song);
    setEditTitle(song.title ?? "");
    setEditLyrics(song.lyrics ?? "");
    setEditCategory(song.category ?? "");
    setEditYoutubeUrl(song.youtubeUrl ?? "");
    setError("");
  }

  function closeEdit() {
    if (saving) return;

    setEditingSong(null);
    setEditTitle("");
    setEditLyrics("");
    setEditCategory("");
    setEditYoutubeUrl("");
  }

  async function handleSaveEdit() {
    if (!editingSong) return;

    const title = editTitle.trim();
    const lyrics = editLyrics.trim();
    const newCategory = editCategory.trim();
    const youtubeUrl = editYoutubeUrl.trim();

    if (!title) {
      setError("Song title is required.");
      return;
    }

    if (!lyrics) {
      setError("Lyrics are required.");
      return;
    }

    if (lyrics.length < 30) {
      setError("Lyrics must contain at least 30 characters.");
      return;
    }

    if (!newCategory) {
      setError("Please select a category.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const songRef = doc(
        db,
        "shared_songs",
        editingSong.id
      );

      await updateDoc(songRef, {
        title,
        lyrics,
        category: newCategory,
        youtubeUrl,
      });

      setSongs((currentSongs) =>
        currentSongs.map((song) =>
          song.id === editingSong.id
            ? {
                ...song,
                title,
                lyrics,
                category: newCategory,
                youtubeUrl,
              }
            : song
        )
      );

      setSelectedSong(null);
      closeEdit();
    } catch (err) {
      console.error("SONGS UPDATE FAILED:", err);

      setError(
        "Unable to update this song. Please check your Firebase permissions."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(song: Song) {
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete "${song.title || "this song"}"?\n\nThis will remove the song from the shared_songs collection and it cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(song.id);
    setError("");

    try {
      const songRef = doc(
        db,
        "shared_songs",
        song.id
      );

      await deleteDoc(songRef);

      setSongs((currentSongs) =>
        currentSongs.filter(
          (item) => item.id !== song.id
        )
      );

      setSelectedIds((current) =>
        current.filter((id) => id !== song.id)
      );

      if (selectedSong?.id === song.id) {
        setSelectedSong(null);
      }
    } catch (err) {
      console.error("SONGS DELETE FAILED:", err);

      setError(
        "Unable to delete this song. Please check your Firebase permissions."
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) {
      return;
    }

    const selectedSongs = songs.filter((song) =>
      selectedIds.includes(song.id)
    );

    const previewNames = selectedSongs
      .slice(0, 5)
      .map((song) => `• ${song.title || "Untitled"}`)
      .join("\n");

    const extraCount =
      selectedSongs.length > 5
        ? `\n• ...and ${selectedSongs.length - 5} more`
        : "";

    const confirmed = window.confirm(
      `You are about to permanently delete ${selectedSongs.length} song${selectedSongs.length === 1 ? "" : "s"}.\n\n${previewNames}${extraCount}\n\nThis action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setBulkDeleting(true);
    setError("");

    try {
      console.log(
        "SONGS: Bulk deleting:",
        selectedSongs.length
      );

      await Promise.all(
        selectedSongs.map((song) =>
          deleteDoc(
            doc(db, "shared_songs", song.id)
          )
        )
      );

      const deletedIds = new Set(selectedIds);

      setSongs((currentSongs) =>
        currentSongs.filter(
          (song) => !deletedIds.has(song.id)
        )
      );

      setSelectedIds([]);

      if (
        selectedSong &&
        deletedIds.has(selectedSong.id)
      ) {
        setSelectedSong(null);
      }

      console.log("SONGS: Bulk delete successful.");
    } catch (err) {
      console.error("SONGS BULK DELETE FAILED:", err);

      setError(
        "Some songs could not be deleted. Please refresh the page and check which songs remain."
      );

      await loadSongs();
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleRefresh() {
    await loadSongs();
  }

  async function handleLogout() {
    await signOut(auth);
    router.replace("/");
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="text-sm text-slate-500">
          Verifying administrator access...
        </div>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <h1 className="text-xl font-bold text-red-600">
            Access Denied
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            {error || "You are not authorized."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <button
              onClick={() => router.push("/dashboard")}
              className="mb-1 text-sm font-medium text-emerald-600 hover:text-emerald-700"
            >
              ← Back to Dashboard
            </button>

            <h1 className="text-xl font-bold text-slate-900">
              Songs Management
            </h1>

            <p className="text-sm text-slate-500">
              Manage songs stored in Netsir Firestore
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={loading || bulkDeleting}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>

            <button
              onClick={handleLogout}
              className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">
            Shared Songs
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Browse and manage songs currently stored in the{" "}
            <span className="font-medium text-slate-700">
              shared_songs
            </span>{" "}
            collection.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Total Songs
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {loading ? "..." : songs.length}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Categories
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {loading ? "..." : categories.length}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Showing
            </p>

            <p className="mt-2 text-3xl font-bold text-emerald-600">
              {loading ? "..." : filteredSongs.length}
            </p>
          </div>
        </div>

        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Search Songs
              </label>

              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, lyrics, or category..."
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Category
              </label>

              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="all">All Categories</option>

                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-red-700">
                {selectedIds.length} song
                {selectedIds.length === 1 ? "" : "s"} selected
              </p>

              <p className="mt-1 text-xs text-red-500">
                Selected songs will be permanently deleted.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={clearSelection}
                disabled={bulkDeleting}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Clear Selection
              </button>

              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkDeleting
                  ? "Deleting..."
                  : `Delete ${selectedIds.length}`}
              </button>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="border-b px-6 py-4">
            <h3 className="font-bold text-slate-900">
              Songs List
            </h3>

            <p className="mt-1 text-xs text-slate-400">
              {filteredSongs.length} song
              {filteredSongs.length === 1 ? "" : "s"} displayed
              {selectedIds.length > 0 &&
                ` • ${selectedIds.length} selected`}
            </p>
          </div>

          {loading ? (
            <div className="px-6 py-16 text-center">
              <p className="text-sm text-slate-500">
                Loading songs...
              </p>
            </div>
          ) : filteredSongs.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="text-4xl">🎵</div>

              <h4 className="mt-4 font-semibold text-slate-900">
                No songs found
              </h4>

              <p className="mt-1 text-sm text-slate-500">
                Try changing your search or category filter.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="w-14 px-6 py-4">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                        className="h-4 w-4 cursor-pointer rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        title={
                          allVisibleSelected
                            ? "Deselect all visible songs"
                            : "Select all visible songs"
                        }
                      />
                    </th>

                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      #
                    </th>

                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Song
                    </th>

                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Category
                    </th>

                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Lyrics
                    </th>

                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Audio
                    </th>

                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredSongs.map((song, index) => {
                    const isSelected = selectedIds.includes(song.id);

                    return (
                      <tr
                        key={song.id}
                        className={`transition ${
                          isSelected
                            ? "bg-red-50"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() =>
                              toggleSongSelection(song.id)
                            }
                            className="h-4 w-4 cursor-pointer rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                        </td>

                        <td className="px-6 py-4 text-sm text-slate-400">
                          {index + 1}
                        </td>

                        <td className="max-w-[220px] px-6 py-4">
                          <div className="font-semibold text-slate-900">
                            {song.title || "Untitled"}
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          {song.category ? (
                            <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                              {song.category}
                            </span>
                          ) : (
                            <span className="text-sm text-slate-400">
                              —
                            </span>
                          )}
                        </td>

                        <td className="max-w-[300px] px-6 py-4">
                          <p className="line-clamp-2 text-sm leading-6 text-slate-500">
                            {song.lyrics || "No lyrics"}
                          </p>
                        </td>

                        <td className="px-6 py-4">
                          {song.youtubeUrl ? (
                            <span className="inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600">
                              Available
                            </span>
                          ) : (
                            <span className="text-sm text-slate-400">
                              —
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() =>
                                setSelectedSong(song)
                              }
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                              View
                            </button>

                            <button
                              onClick={() => openEdit(song)}
                              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() =>
                                handleDelete(song)
                              }
                              disabled={
                                deletingId === song.id ||
                                bulkDeleting
                              }
                              className="rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {deletingId === song.id
                                ? "Deleting..."
                                : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selectedIds.length > 0 && (
          <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
            <span>
              {selectedVisibleCount} of {filteredSongs.length}{" "}
              visible songs selected
            </span>

            {selectedIds.length !== selectedVisibleCount && (
              <span>
                {selectedIds.length - selectedVisibleCount} selected
                outside the current filter
              </span>
            )}
          </div>
        )}
      </div>

      {/* View Details Modal */}
      {selectedSong && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
          onClick={() => setSelectedSong(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b px-6 py-5">
              <div className="pr-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                  Song Details
                </p>

                <h3 className="mt-1 text-2xl font-bold text-slate-900">
                  {selectedSong.title || "Untitled"}
                </h3>
              </div>

              <button
                onClick={() => setSelectedSong(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                ×
              </button>
            </div>

            <div className="space-y-6 px-6 py-6">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Category
                </p>

                {selectedSong.category ? (
                  <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
                    {selectedSong.category}
                  </span>
                ) : (
                  <p className="text-sm text-slate-400">
                    Not available
                  </p>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Lyrics
                </p>

                <div className="max-h-[350px] overflow-y-auto rounded-xl bg-slate-50 p-5">
                  <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                    {selectedSong.lyrics || "No lyrics available."}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  YouTube / Audio URL
                </p>

                {selectedSong.youtubeUrl ? (
                  <a
                    href={selectedSong.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-sm font-medium text-emerald-600 hover:underline"
                  >
                    {selectedSong.youtubeUrl}
                  </a>
                ) : (
                  <p className="text-sm text-slate-400">
                    No audio URL
                  </p>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Created
                </p>

                <p className="text-sm text-slate-700">
                  {formatDate(selectedSong.createdAt)}
                </p>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Firestore Document ID
                </p>

                <div className="rounded-lg bg-slate-100 px-4 py-3">
                  <p className="break-all font-mono text-xs text-slate-600">
                    {selectedSong.id}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t bg-slate-50 px-6 py-4">
              <button
                onClick={() => handleDelete(selectedSong)}
                disabled={
                  deletingId === selectedSong.id ||
                  bulkDeleting
                }
                className="rounded-lg bg-red-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingId === selectedSong.id
                  ? "Deleting..."
                  : "Delete"}
              </button>

              <button
                onClick={() => openEdit(selectedSong)}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                Edit
              </button>

              <button
                onClick={() => setSelectedSong(null)}
                className="rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-900"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingSong && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                  Edit Song
                </p>

                <h3 className="mt-1 text-2xl font-bold text-slate-900">
                  {editingSong.title || "Untitled"}
                </h3>
              </div>

              <button
                onClick={closeEdit}
                disabled={saving}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <div className="space-y-5 px-6 py-6">
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Song Title
                </label>

                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  disabled={saving}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                  placeholder="Enter song title"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Category
                </label>

                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  disabled={saving}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                >
                  <option value="">Select a category</option>

                  {categories.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-700">
                    Lyrics
                  </label>

                  <span
                    className={`text-xs ${
                      editLyrics.trim().length < 30
                        ? "text-red-500"
                        : "text-slate-400"
                    }`}
                  >
                    {editLyrics.trim().length} characters
                  </span>
                </div>

                <textarea
                  value={editLyrics}
                  onChange={(e) => setEditLyrics(e.target.value)}
                  disabled={saving}
                  rows={12}
                  className="w-full resize-y rounded-xl border border-slate-300 px-4 py-3 text-sm leading-7 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                  placeholder="Enter lyrics..."
                />

                {editLyrics.trim().length < 30 && (
                  <p className="mt-1 text-xs text-red-500">
                    Lyrics must contain at least 30 characters.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  YouTube / Audio URL
                </label>

                <input
                  type="url"
                  value={editYoutubeUrl}
                  onChange={(e) =>
                    setEditYoutubeUrl(e.target.value)
                  }
                  disabled={saving}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                  placeholder="https://youtube.com/..."
                />
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Firestore Document ID
                </p>

                <p className="mt-1 break-all font-mono text-xs text-slate-600">
                  {editingSong.id}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t bg-slate-50 px-6 py-4">
              <button
                onClick={closeEdit}
                disabled={saving}
                className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
