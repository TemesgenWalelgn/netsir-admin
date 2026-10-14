"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";

import {
  Music2,
  Search,
  RefreshCw,
  Plus,
  Eye,
  Pencil,
  Trash2,
  MoreVertical,
  X,
  Check,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  FolderOpen,
  CheckCircle2,
  Circle,
  ListMusic,
  Clock3,
  Copy,
  AlertTriangle,
} from "lucide-react";

import { auth, db } from "@/lib/firebase";

type Song = {
  id: string;
  title: string;
  lyrics: string;
  category: string;
  youtubeUrl: string;
  isFavorite?: boolean;
  isUserCreated?: boolean;
  uploaderId?: string;
  createdAt?: Timestamp | null;
  timestamp?: Timestamp | null;
};

type Category = {
  id: string;
  name: string;
};

type DuplicateGroup = {
  key: string;
  title: string;
  songs: Song[];
};

type ModalType = "view" | "edit" | "add" | null;

type SearchType = "all" | "name" | "category" | "lyrics";

type SortOrder = "default" | "asc" | "desc";

// Duplicate matching is based on song title, ignoring capitalization,
// spaces, and punctuation. Lyrics are shown so the admin can compare
// versions before choosing which song to keep.
function normalizeDuplicateTitle(title: string) {
  return title
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
}

export default function SongsPage() {
  const router = useRouter();

  const [songs, setSongs] = useState<Song[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Duplicate review
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [keepSongByGroup, setKeepSongByGroup] = useState<Record<string, string>>({});
  const [duplicateDeletingId, setDuplicateDeletingId] = useState("");
  const [duplicateSuccess, setDuplicateSuccess] = useState("");

  // Search and filters
  const [search, setSearch] = useState("");
  const [searchType, setSearchType] =
    useState<SearchType>("all");
  const [categoryFilter, setCategoryFilter] =
    useState("all");

  // Alphabetical sorting
  const [sortOrder, setSortOrder] =
    useState<SortOrder>("default");

  const [selectedIds, setSelectedIds] = useState<string[]>(
    []
  );

  const [modal, setModal] = useState<ModalType>(null);
  const [selectedSong, setSelectedSong] =
    useState<Song | null>(null);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Add/Edit fields
  const [title, setTitle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [category, setCategory] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");

  const [formError, setFormError] = useState("");

  const loadData = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");
      setDuplicateSuccess("");

      try {
        const user = auth.currentUser;

        if (!user) {
          router.replace("/");
          return;
        }

        // Verify admin access using the current user's UID.
        const adminRef = doc(db, "admins", user.uid);
        const adminSnapshot = await getDoc(adminRef);

        if (!adminSnapshot.exists()) {
          router.replace("/");
          return;
        }

        const adminData = adminSnapshot.data();

        if (adminData.role !== "admin") {
          router.replace("/");
          return;
        }

        const [songsSnapshot, categoriesSnapshot] =
          await Promise.all([
            getDocs(collection(db, "shared_songs")),
            getDocs(collection(db, "categories")),
          ]);

        const loadedSongs: Song[] = songsSnapshot.docs.map(
          (songDoc) => {
            const data = songDoc.data();

            return {
              id: songDoc.id,
              title: data.title || "",
              lyrics: data.lyrics || "",
              category: data.category || "",
              youtubeUrl: data.youtubeUrl || "",
              isFavorite: data.isFavorite,
              isUserCreated: data.isUserCreated,
              uploaderId: data.uploaderId,
              createdAt: data.createdAt || null,
              timestamp: data.timestamp || null,
            };
          }
        );

        const loadedCategories: Category[] =
          categoriesSnapshot.docs.map((categoryDoc) => {
            const data = categoryDoc.data();

            return {
              id: categoryDoc.id,
              name: data.name || "",
            };
          });

        setSongs(loadedSongs);
        setCategories(loadedCategories);
      } catch (err) {
        console.error("Songs loading error:", err);
        setError("Unable to load songs. Please try again.");
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

      loadData();
    });

    return () => unsubscribe();
  }, [loadData, router]);

  // Category options include both Firestore categories
  // and categories already used by existing songs.
  const categoryOptions = useMemo(() => {
    const names = new Set<string>();

    categories.forEach((item) => {
      if (item.name.trim()) {
        names.add(item.name.trim());
      }
    });

    songs.forEach((song) => {
      if (song.category.trim()) {
        names.add(song.category.trim());
      }
    });

    return Array.from(names).sort((a, b) =>
      a.localeCompare(b, "am")
    );
  }, [categories, songs]);

  // Find title-duplicate groups across all loaded songs.
  // This is intentionally separate from the visible search filters.
  const duplicateGroups = useMemo<DuplicateGroup[]>(() => {
    const grouped = new Map<string, Song[]>();

    songs.forEach((song) => {
      const key = normalizeDuplicateTitle(song.title);
      if (!key) return;

      const group = grouped.get(key) || [];
      group.push(song);
      grouped.set(key, group);
    });

    return Array.from(grouped.entries())
      .filter(([, groupSongs]) => groupSongs.length > 1)
      .map(([key, groupSongs]) => ({
        key,
        title: groupSongs[0]?.title || "Untitled",
        songs: [...groupSongs].sort((a, b) => {
          const aDate = a.createdAt?.toMillis() ?? a.timestamp?.toMillis() ?? 0;
          const bDate = b.createdAt?.toMillis() ?? b.timestamp?.toMillis() ?? 0;
          return aDate - bDate;
        }),
      }))
      .sort((a, b) => a.title.localeCompare(b.title, "am", { sensitivity: "base" }));
  }, [songs]);

  const duplicateExtraCount = useMemo(
    () => duplicateGroups.reduce(
      (total, group) => total + group.songs.length - 1,
      0
    ),
    [duplicateGroups]
  );

  // Search + category filtering + alphabetical sorting.
  //
  // Search type:
  // - all      = title + lyrics + category
  // - name     = title only
  // - category = category only
  // - lyrics   = lyrics only
  //
  // Sort:
  // - default = Firestore/current order
  // - asc     = A → Z
  // - desc    = Z → A
  const filteredSongs = useMemo(() => {
    const query = search.trim().toLowerCase();

    const result = songs.filter((song) => {
      let matchesSearch = true;

      if (query) {
        const titleText = song.title.toLowerCase();
        const lyricsText = song.lyrics.toLowerCase();
        const categoryText =
          song.category.toLowerCase();

        if (searchType === "name") {
          matchesSearch = titleText.includes(query);
        } else if (searchType === "category") {
          matchesSearch =
            categoryText.includes(query);
        } else if (searchType === "lyrics") {
          matchesSearch = lyricsText.includes(query);
        } else {
          matchesSearch =
            titleText.includes(query) ||
            lyricsText.includes(query) ||
            categoryText.includes(query);
        }
      }

      const matchesCategory =
        categoryFilter === "all" ||
        song.category === categoryFilter;

      return matchesSearch && matchesCategory;
    });

    if (sortOrder === "asc") {
      result.sort((a, b) =>
        a.title.localeCompare(b.title, "am", {
          sensitivity: "base",
        })
      );
    }

    if (sortOrder === "desc") {
      result.sort((a, b) =>
        b.title.localeCompare(a.title, "am", {
          sensitivity: "base",
        })
      );
    }

    return result;
  }, [
    songs,
    search,
    searchType,
    categoryFilter,
    sortOrder,
  ]);

  const audioCount = useMemo(
    () =>
      songs.filter((song) => song.youtubeUrl.trim())
        .length,
    [songs]
  );

  const selectedCount = selectedIds.length;

  const allVisibleSelected =
    filteredSongs.length > 0 &&
    filteredSongs.every((song) =>
      selectedIds.includes(song.id)
    );

  function openView(song: Song) {
    setSelectedSong(song);
    setModal("view");
  }

  function openEdit(song: Song) {
    setSelectedSong(song);
    setTitle(song.title);
    setLyrics(song.lyrics);
    setCategory(song.category);
    setYoutubeUrl(song.youtubeUrl);
    setFormError("");
    setModal("edit");
  }

  function openAdd() {
    setSelectedSong(null);
    setTitle("");
    setLyrics("");
    setCategory(categoryOptions[0] || "");
    setYoutubeUrl("");
    setFormError("");
    setModal("add");
  }

  function closeModal() {
    if (saving) return;

    setModal(null);
    setSelectedSong(null);
    setFormError("");
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function toggleSelectAllVisible() {
    const visibleIds = filteredSongs.map(
      (song) => song.id
    );

    if (allVisibleSelected) {
      setSelectedIds((current) =>
        current.filter(
          (id) => !visibleIds.includes(id)
        )
      );
    } else {
      setSelectedIds((current) => {
        const next = new Set(current);

        visibleIds.forEach((id) => next.add(id));

        return Array.from(next);
      });
    }
  }

  function clearFilters() {
    setSearch("");
    setSearchType("all");
    setCategoryFilter("all");
    setSortOrder("default");
  }

  function validateSongForm() {
    if (!title.trim()) {
      setFormError("Song title is required.");
      return false;
    }

    if (!lyrics.trim()) {
      setFormError("Lyrics are required.");
      return false;
    }

    if (lyrics.trim().length < 30) {
      setFormError(
        `Lyrics must contain at least 30 characters. Current: ${lyrics.trim().length}.`
      );
      return false;
    }

    if (!category.trim()) {
      setFormError("Please select a category.");
      return false;
    }

    return true;
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();

    if (!validateSongForm()) return;

    setSaving(true);
    setFormError("");

    try {
      const user = auth.currentUser;

      if (!user) {
        setFormError(
          "Your session has expired. Please sign in again."
        );
        return;
      }

      const normalizedTitle =
        normalizeDuplicateTitle(title);

      const duplicate = songs.find(
        (song) =>
          normalizeDuplicateTitle(song.title) ===
            normalizedTitle &&
          song.id !== selectedSong?.id
      );

      if (duplicate) {
        setFormError(
          `A song with the title "${duplicate.title}" already exists.`
        );
        return;
      }

      if (modal === "add") {
        const docRef = await addDoc(
          collection(db, "shared_songs"),
          {
            title: title.trim(),
            lyrics: lyrics.trim(),
            category: category.trim(),
            youtubeUrl: youtubeUrl.trim(),
            isFavorite: false,
            isUserCreated: true,
            uploaderId: user.uid,
            createdAt: serverTimestamp(),
            timestamp: serverTimestamp(),
          }
        );

        const newSong: Song = {
          id: docRef.id,
          title: title.trim(),
          lyrics: lyrics.trim(),
          category: category.trim(),
          youtubeUrl: youtubeUrl.trim(),
          isFavorite: false,
          isUserCreated: true,
          uploaderId: user.uid,
          createdAt: null,
          timestamp: null,
        };

        setSongs((current) => [newSong, ...current]);
      }

      if (modal === "edit" && selectedSong) {
        await updateDoc(
          doc(db, "shared_songs", selectedSong.id),
          {
            title: title.trim(),
            lyrics: lyrics.trim(),
            category: category.trim(),
            youtubeUrl: youtubeUrl.trim(),
          }
        );

        setSongs((current) =>
          current.map((song) =>
            song.id === selectedSong.id
              ? {
                  ...song,
                  title: title.trim(),
                  lyrics: lyrics.trim(),
                  category: category.trim(),
                  youtubeUrl: youtubeUrl.trim(),
                }
              : song
          )
        );
      }

      closeModal();
    } catch (err) {
      console.error("Save song error:", err);
      setFormError(
        "Unable to save the song. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteSong(song: Song) {
    const confirmed = window.confirm(
      `Delete "${song.title}"?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    setDeleting(true);

    try {
      await deleteDoc(
        doc(db, "shared_songs", song.id)
      );

      setSongs((current) =>
        current.filter((item) => item.id !== song.id)
      );

      setSelectedIds((current) =>
        current.filter((id) => id !== song.id)
      );
    } catch (err) {
      console.error("Delete song error:", err);
      setError("Unable to delete the song.");
    } finally {
      setDeleting(false);
    }
  }

  async function deleteSelected() {
    if (selectedIds.length === 0) return;

    const selectedSongs = songs.filter((song) =>
      selectedIds.includes(song.id)
    );

    const preview = selectedSongs
      .slice(0, 5)
      .map((song) => `• ${song.title}`)
      .join("\n");

    const extra =
      selectedSongs.length > 5
        ? `\n• And ${selectedSongs.length - 5} more...`
        : "";

    const confirmed = window.confirm(
      `Delete ${selectedSongs.length} selected song(s)?\n\n${preview}${extra}\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    setDeleting(true);
    setError("");

    try {
      await Promise.all(
        selectedIds.map((id) =>
          deleteDoc(doc(db, "shared_songs", id))
        )
      );

      setSongs((current) =>
        current.filter(
          (song) => !selectedIds.includes(song.id)
        )
      );

      setSelectedIds([]);
    } catch (err) {
      console.error("Bulk delete error:", err);
      setError("Some songs could not be deleted.");
    } finally {
      setDeleting(false);
    }
  }

  // Delete copies from one duplicate-title group while preserving
  // the one song explicitly selected by the admin.
  async function deleteDuplicateCopies(group: DuplicateGroup) {
    if (duplicateDeletingId || deleting || saving) return;

    const keeperId = keepSongByGroup[group.key];
    const keeper = group.songs.find((song) => song.id === keeperId);

    if (!keeper) {
      setError("Choose which song to keep before deleting duplicates.");
      return;
    }

    const duplicateCopies = group.songs.filter(
      (song) => song.id !== keeper.id
    );

    if (duplicateCopies.length === 0) return;

    const confirmed = window.confirm(
      `Keep "${keeper.title}" and permanently delete ${duplicateCopies.length} other song(s) with the same title?\n\nThe song you selected to keep will not be deleted. Compare the lyrics and category before continuing.`
    );

    if (!confirmed) return;

    setDuplicateDeletingId(group.key);
    setError("");
    setDuplicateSuccess("");

    const deletedIds: string[] = [];

    try {
      const user = auth.currentUser;

      if (!user) {
        router.replace("/");
        setError("Your session has expired. Please sign in again.");
        return;
      }

      // Re-check administrator access before destructive changes.
      const adminSnapshot = await getDoc(
        doc(db, "admins", user.uid)
      );

      if (
        !adminSnapshot.exists() ||
        adminSnapshot.data()?.role !== "admin"
      ) {
        setError("Only an administrator can delete duplicate songs.");
        router.replace("/");
        return;
      }

      // Delete sequentially so successful deletions are tracked if one fails.
      for (const duplicate of duplicateCopies) {
        await deleteDoc(
          doc(db, "shared_songs", duplicate.id)
        );
        deletedIds.push(duplicate.id);
      }

      setDuplicateSuccess(
        `Removed ${deletedIds.length} duplicate song copy/copies. Kept "${keeper.title}".`
      );
    } catch (err) {
      console.error("Delete duplicate songs error:", err);
      if (deletedIds.length > 0) {
        setError(
          `Deleted ${deletedIds.length} duplicate copy/copies, but one or more remaining copies could not be deleted. Refresh and review the group again.`
        );
      } else {
        setError(
          "Unable to delete duplicate songs. Check Firestore permissions and try again."
        );
      }
    } finally {
      // Reflect any deletions that succeeded, even if another deletion failed.
      if (deletedIds.length > 0) {
        setSongs((current) =>
          current.filter((song) => !deletedIds.includes(song.id))
        );
        setSelectedIds((current) =>
          current.filter((id) => !deletedIds.includes(id))
        );
        if (selectedSong && deletedIds.includes(selectedSong.id)) {
          setSelectedSong(null);
          setModal(null);
        }
      }
      setDuplicateDeletingId("");
    }
  }

  function formatDate(song: Song) {
    const date = song.createdAt || song.timestamp;

    if (!date || !(date instanceof Timestamp)) {
      return "Recently";
    }

    return date.toDate().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="animate-pulse">
          <div className="h-8 w-48 rounded-lg bg-slate-200" />

          <div className="mt-3 h-4 w-72 rounded bg-slate-200" />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-28 rounded-2xl border border-slate-200 bg-white"
            />
          ))}
        </div>

        <div className="h-[500px] animate-pulse rounded-2xl border border-slate-200 bg-white" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Heading */}
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-600">
            <Music2 size={17} />
            Content Management
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Songs
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Manage your Netsir songs, lyrics, categories,
            and audio.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setShowDuplicates((current) => !current);
              setDuplicateSuccess("");
            }}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-sm transition ${
              showDuplicates
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
            }`}
          >
            <Copy size={16} />
            {showDuplicates ? "Hide Duplicates" : "Find Duplicates"}
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
              {duplicateExtraCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw
              size={16}
              className={
                refreshing ? "animate-spin" : ""
              }
            />
            Refresh
          </button>

          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-200 transition hover:bg-emerald-700"
          >
            <Plus size={17} />
            Add Song
          </button>
        </div>
      </section>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={18} />

          <span className="flex-1">{error}</span>

          <button
            type="button"
            onClick={() => setError("")}
            className="rounded-lg p-1 hover:bg-red-100"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Duplicate review panel */}
      {showDuplicates && (
        <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-amber-100 bg-amber-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <div className="flex items-center gap-2 text-amber-800">
                <AlertTriangle size={18} />
                <h2 className="font-semibold">Duplicate Songs</h2>
              </div>
              <p className="mt-1 text-xs leading-5 text-amber-800/80">
                Found {duplicateGroups.length} duplicate title group(s) and {duplicateExtraCount} extra copy/copies. Titles are compared without case, spaces, or punctuation. Check each song's lyrics before deleting.
              </p>
            </div>
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={refreshing || !!duplicateDeletingId}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-white px-3.5 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              Refresh duplicate scan
            </button>
          </div>

          {duplicateSuccess && (
            <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-3 text-sm text-emerald-700 sm:px-6">
              <span className="inline-flex items-start gap-2">
                <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
                {duplicateSuccess}
              </span>
            </div>
          )}

          {duplicateGroups.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 size={23} />
              </div>
              <p className="font-semibold text-slate-800">No duplicate titles found</p>
              <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">
                Every song title is unique according to the current matching rules.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {duplicateGroups.map((group) => {
                const keeperId = keepSongByGroup[group.key] || "";
                const isDeletingThisGroup = duplicateDeletingId === group.key;

                return (
                  <div key={group.key} className="p-4 sm:p-6">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="break-words text-base font-bold text-slate-900">
                          {group.title || "Untitled"}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {group.songs.length} songs share this title. Select the one to keep; the others will be deleted.
                        </p>
                      </div>
                      <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                        {group.songs.length - 1} extra {group.songs.length - 1 === 1 ? "copy" : "copies"}
                      </span>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      {group.songs.map((song) => {
                        const isKeeper = keeperId === song.id;

                        return (
                          <label
                            key={song.id}
                            className={`block cursor-pointer rounded-xl border p-4 transition ${
                              isKeeper
                                ? "border-emerald-400 bg-emerald-50/70 ring-2 ring-emerald-100"
                                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="radio"
                                name={`keep-duplicate-${group.key}`}
                                checked={isKeeper}
                                onChange={() => {
                                  setKeepSongByGroup((current) => ({
                                    ...current,
                                    [group.key]: song.id,
                                  }));
                                  setDuplicateSuccess("");
                                }}
                                disabled={!!duplicateDeletingId}
                                className="mt-1 h-4 w-4 accent-emerald-600"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="break-words text-sm font-semibold text-slate-800">
                                    {song.title || "Untitled"}
                                  </p>
                                  {isKeeper && (
                                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                      Keep this one
                                    </span>
                                  )}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                                  <span className="rounded-md bg-slate-100 px-2 py-1">
                                    {song.category || "Uncategorized"}
                                  </span>
                                  <span className="rounded-md bg-slate-100 px-2 py-1">
                                    {formatDate(song)}
                                  </span>
                                  {song.youtubeUrl && (
                                    <a
                                      href={song.youtubeUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(event) => event.stopPropagation()}
                                      className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 font-medium text-blue-700 hover:bg-blue-100"
                                    >
                                      <ExternalLink size={11} /> Audio
                                    </a>
                                  )}
                                </div>
                                <p className="mt-3 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">
                                  {song.lyrics
                                    ? `${song.lyrics.slice(0, 260)}${song.lyrics.length > 260 ? "…" : ""}`
                                    : "No lyrics available."}
                                </p>
                                <p className="mt-3 break-all font-mono text-[10px] text-slate-400">
                                  ID: {song.id}
                                </p>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs leading-5 text-slate-500">
                        {keeperId
                          ? `The selected song will remain. ${group.songs.length - 1} other copy/copies will be deleted.`
                          : "Choose the song you want to keep before deleting the other copies."}
                      </p>
                      <button
                        type="button"
                        onClick={() => void deleteDuplicateCopies(group)}
                        disabled={!keeperId || !!duplicateDeletingId || deleting || saving}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isDeletingThisGroup ? (
                          <RefreshCw size={16} className="animate-spin" />
                        ) : (
                          <Trash2 size={16} />
                        )}
                        {isDeletingThisGroup ? "Deleting duplicates..." : "Delete duplicates, keep selected"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Statistics */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <ListMusic size={21} />
            </div>

            <div>
              <p className="text-xs font-medium text-slate-400">
                Total Songs
              </p>

              <p className="mt-1 text-2xl font-bold text-slate-900">
                {songs.length}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <FolderOpen size={21} />
            </div>

            <div>
              <p className="text-xs font-medium text-slate-400">
                Categories
              </p>

              <p className="mt-1 text-2xl font-bold text-slate-900">
                {categoryOptions.length}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <ExternalLink size={21} />
            </div>

            <div>
              <p className="text-xs font-medium text-slate-400">
                With Audio
              </p>

              <p className="mt-1 text-2xl font-bold text-slate-900">
                {audioCount}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Main card */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Toolbar */}
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row">
            {/* Search type */}
            <div className="relative lg:w-44">
              <select
                value={searchType}
                onChange={(event) =>
                  setSearchType(
                    event.target.value as SearchType
                  )
                }
                className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 pr-10 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-50"
              >
                <option value="all">
                  All Fields
                </option>

                <option value="name">
                  Name
                </option>

                <option value="category">
                  Category
                </option>

                <option value="lyrics">
                  Lyrics
                </option>
              </select>

              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </div>

            {/* Search input */}
            <div className="relative flex-1">
              <Search
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder={
                  searchType === "name"
                    ? "Search by song name..."
                    : searchType === "category"
                      ? "Search by category..."
                      : searchType === "lyrics"
                        ? "Search in lyrics..."
                        : "Search by name, lyrics, or category..."
                }
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-50"
              />

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {/* Category filter */}
            <div className="relative lg:w-56">
              <FolderOpen
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <select
                value={categoryFilter}
                onChange={(event) =>
                  setCategoryFilter(event.target.value)
                }
                className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-50"
              >
                <option value="all">
                  All Categories
                </option>

                {categoryOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>

              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </div>

            {/* Alphabetical sorting */}
            <div className="relative lg:w-48">
              <select
                value={sortOrder}
                onChange={(event) =>
                  setSortOrder(
                    event.target.value as SortOrder
                  )
                }
                className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 pr-10 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-50"
              >
                <option value="default">
                  Default Order
                </option>

                <option value="asc">
                  A → Z
                </option>

                <option value="desc">
                  Z → A
                </option>
              </select>

              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </div>
          </div>

          {/* Results summary */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              Showing{" "}
              <span className="font-semibold text-slate-600">
                {filteredSongs.length}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-slate-600">
                {songs.length}
              </span>{" "}
              songs
            </p>

            {(search ||
              searchType !== "all" ||
              categoryFilter !== "all" ||
              sortOrder !== "default") && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Active search/sort information */}
        {(search ||
          searchType !== "all" ||
          sortOrder !== "default") && (
          <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-2.5 sm:px-5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              {(search || searchType !== "all") && (
                <span>
                  Searching{" "}
                  <span className="font-semibold text-slate-700">
                    {searchType === "name"
                      ? "song names"
                      : searchType === "category"
                        ? "categories"
                        : searchType === "lyrics"
                          ? "lyrics"
                          : "all fields"}
                  </span>
                  {search && (
                    <>
                      {" "}
                      for{" "}
                      <span className="font-semibold text-emerald-700">
                        "{search}"
                      </span>
                    </>
                  )}
                </span>
              )}

              {sortOrder !== "default" && (
                <span className="font-medium text-slate-600">
                  •{" "}
                  {sortOrder === "asc"
                    ? "A → Z"
                    : "Z → A"}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Bulk toolbar */}
        {selectedCount > 0 && (
          <div className="flex flex-col gap-3 border-b border-red-100 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex items-center gap-2 text-sm font-medium text-red-700">
              <CheckCircle2 size={17} />

              {selectedCount} song
              {selectedCount !== 1 ? "s" : ""} selected
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-white"
              >
                Clear Selection
              </button>

              <button
                type="button"
                onClick={deleteSelected}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                <Trash2 size={14} />

                {deleting
                  ? "Deleting..."
                  : `Delete ${selectedCount}`}
              </button>
            </div>
          </div>
        )}

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                <th className="w-12 px-5 py-3 text-left">
                  <button
                    type="button"
                    onClick={toggleSelectAllVisible}
                    className="flex items-center justify-center text-slate-400 hover:text-emerald-600"
                    title="Select all visible"
                  >
                    {allVisibleSelected ? (
                      <CheckCircle2
                        size={18}
                        className="text-emerald-600"
                      />
                    ) : (
                      <Circle size={18} />
                    )}
                  </button>
                </th>

                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Song
                </th>

                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Category
                </th>

                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Audio
                </th>

                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Added
                </th>

                <th className="w-16 px-5 py-3" />
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredSongs.map((song) => {
                const selected = selectedIds.includes(
                  song.id
                );

                return (
                  <tr
                    key={song.id}
                    className={`group transition hover:bg-slate-50 ${
                      selected ? "bg-red-50/50" : ""
                    }`}
                  >
                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() =>
                          toggleSelection(song.id)
                        }
                        className="flex items-center justify-center text-slate-400 hover:text-emerald-600"
                      >
                        {selected ? (
                          <CheckCircle2
                            size={18}
                            className="text-emerald-600"
                          />
                        ) : (
                          <Circle size={18} />
                        )}
                      </button>
                    </td>

                    <td className="max-w-[360px] px-3 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-sm font-bold text-emerald-700">
                          {song.title
                            .trim()
                            .charAt(0) || "♪"}
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {song.title || "Untitled"}
                          </p>

                          <p className="mt-0.5 max-w-[300px] truncate text-xs text-slate-400">
                            {song.lyrics || "No lyrics"}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-4">
                      <span className="inline-flex max-w-[150px] truncate rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        {song.category ||
                          "Uncategorized"}
                      </span>
                    </td>

                    <td className="px-3 py-4">
                      {song.youtubeUrl ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                          <CheckCircle2 size={13} />
                          Available
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">
                          No audio
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-4">
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                        <Clock3 size={13} />
                        {formatDate(song)}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <div className="relative flex justify-end">
                        <details className="group/menu relative">
                          <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                            <MoreVertical size={18} />
                          </summary>

                          <div className="absolute right-0 top-10 z-20 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                            <button
                              type="button"
                              onClick={() =>
                                openView(song)
                              }
                              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              <Eye size={15} />
                              View Song
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                openEdit(song)
                              }
                              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              <Pencil size={15} />
                              Edit Song
                            </button>

                            {song.youtubeUrl && (
                              <a
                                href={song.youtubeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-slate-600 hover:bg-slate-50"
                              >
                                <ExternalLink
                                  size={15}
                                />
                                Open Audio
                              </a>
                            )}

                            <div className="my-1 border-t border-slate-100" />

                            <button
                              type="button"
                              onClick={() =>
                                deleteSong(song)
                              }
                              disabled={deleting}
                              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={15} />
                              Delete
                            </button>
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="divide-y divide-slate-100 md:hidden">
          {filteredSongs.map((song) => {
            const selected = selectedIds.includes(
              song.id
            );

            return (
              <div
                key={song.id}
                className={`p-4 ${
                  selected ? "bg-red-50/50" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      toggleSelection(song.id)
                    }
                    className="mt-1 shrink-0 text-slate-400"
                  >
                    {selected ? (
                      <CheckCircle2
                        size={18}
                        className="text-emerald-600"
                      />
                    ) : (
                      <Circle size={18} />
                    )}
                  </button>

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-sm font-bold text-emerald-700">
                    {song.title.trim().charAt(0) || "♪"}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {song.title || "Untitled"}
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          {song.category ||
                            "Uncategorized"}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          openView(song)
                        }
                        className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Eye size={17} />
                      </button>
                    </div>

                    <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500">
                      {song.lyrics || "No lyrics"}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500">
                        <Clock3 size={11} />
                        {formatDate(song)}
                      </span>

                      {song.youtubeUrl ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700">
                          <CheckCircle2 size={11} />
                          Audio
                        </span>
                      ) : (
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-400">
                          No audio
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          openEdit(song)
                        }
                        className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                      >
                        <Pencil size={13} />
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          deleteSong(song)
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={13} />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty state */}
        {filteredSongs.length === 0 && (
          <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <Music2 size={25} />
            </div>

            <h3 className="font-semibold text-slate-800">
              {songs.length === 0
                ? "No songs yet"
                : "No matching songs"}
            </h3>

            <p className="mt-1 max-w-sm text-sm text-slate-400">
              {songs.length === 0
                ? "Add your first song to start building the Netsir library."
                : "Try changing your search or category filter."}
            </p>

            {songs.length === 0 ? (
              <button
                type="button"
                onClick={openAdd}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                <Plus size={16} />
                Add First Song
              </button>
            ) : (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-5 text-sm font-medium text-emerald-600 hover:text-emerald-700"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </section>

      {/* View modal */}
      {modal === "view" && selectedSong && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs font-medium text-emerald-600">
                  Song Details
                </p>

                <h2 className="mt-1 text-lg font-bold text-slate-900">
                  View Song
                </h2>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="max-h-[calc(90vh-80px)] overflow-y-auto p-5 sm:p-6">
              <div className="mb-6 flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-lg font-bold text-emerald-700">
                  {selectedSong.title
                    .trim()
                    .charAt(0) || "♪"}
                </div>

                <div className="min-w-0">
                  <h3 className="break-words text-xl font-bold text-slate-900">
                    {selectedSong.title}
                  </h3>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                      {selectedSong.category ||
                        "Uncategorized"}
                    </span>

                    {selectedSong.youtubeUrl && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        <CheckCircle2 size={12} />
                        Audio available
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Lyrics
                </p>

                <div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {selectedSong.lyrics}
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-medium text-slate-400">
                    Added
                  </p>

                  <p className="mt-1 text-sm font-medium text-slate-700">
                    {formatDate(selectedSong)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-medium text-slate-400">
                    Firestore ID
                  </p>

                  <p className="mt-1 break-all font-mono text-xs text-slate-600">
                    {selectedSong.id}
                  </p>
                </div>
              </div>

              {selectedSong.youtubeUrl && (
                <a
                  href={selectedSong.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  <ExternalLink size={16} />
                  Open YouTube Audio
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      {(modal === "add" || modal === "edit") && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs font-medium text-emerald-600">
                  {modal === "add"
                    ? "Create Content"
                    : "Update Content"}
                </p>

                <h2 className="mt-1 text-lg font-bold text-slate-900">
                  {modal === "add"
                    ? "Add New Song"
                    : "Edit Song"}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={handleSave}
              className="max-h-[calc(92vh-80px)] overflow-y-auto"
            >
              <div className="space-y-5 p-5 sm:p-6">
                {formError && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertCircle
                      size={18}
                      className="mt-0.5 shrink-0"
                    />

                    <span>{formError}</span>
                  </div>
                )}

                {/* Title */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Song Title
                  </label>

                  <input
                    type="text"
                    value={title}
                    onChange={(event) =>
                      setTitle(event.target.value)
                    }
                    placeholder="Enter song title"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    Category
                  </label>

                  <div className="relative">
                    <select
                      value={category}
                      onChange={(event) =>
                        setCategory(event.target.value)
                      }
                      className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 pr-10 text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50"
                    >
                      <option value="">
                        Select a category
                      </option>

                      {categoryOptions.map((item) => (
                        <option
                          key={item}
                          value={item}
                        >
                          {item}
                        </option>
                      ))}
                    </select>

                    <ChevronDown
                      size={16}
                      className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  </div>

                  {categoryOptions.length === 0 && (
                    <p className="mt-2 text-xs text-amber-600">
                      No categories found. Add a category
                      first.
                    </p>
                  )}
                </div>

                {/* Lyrics */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm font-semibold text-slate-700">
                      Lyrics
                    </label>

                    <span
                      className={`text-xs ${
                        lyrics.trim().length < 30
                          ? "text-amber-600"
                          : "text-emerald-600"
                      }`}
                    >
                      {lyrics.trim().length} characters
                    </span>
                  </div>

                  <textarea
                    value={lyrics}
                    onChange={(event) =>
                      setLyrics(event.target.value)
                    }
                    placeholder="Enter the complete song lyrics..."
                    rows={10}
                    className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50"
                  />

                  <p className="mt-1.5 text-xs text-slate-400">
                    Minimum 30 characters.
                  </p>
                </div>

                {/* YouTube */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700">
                    YouTube URL
                    <span className="ml-2 font-normal text-slate-400">
                      Optional
                    </span>
                  </label>

                  <div className="relative">
                    <ExternalLink
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />

                    <input
                      type="url"
                      value={youtubeUrl}
                      onChange={(event) =>
                        setYoutubeUrl(
                          event.target.value
                        )
                      }
                      placeholder="https://youtube.com/watch?v=..."
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50"
                    />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-200 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <RefreshCw
                        size={16}
                        className="animate-spin"
                      />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check size={16} />

                      {modal === "add"
                        ? "Save Song"
                        : "Save Changes"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
