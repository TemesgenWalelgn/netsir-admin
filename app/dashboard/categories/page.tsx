
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";

type Category = {
  id: string;
  name: string;
  createdAt?: any;
  updatedAt?: any;
};

type Song = {
  id: string;
  title?: string;
  lyrics?: string;
  category?: string;
  youtubeUrl?: string;
};

export default function CategoriesPage() {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSongsModal, setShowSongsModal] = useState(false);

  const [selectedCategory, setSelectedCategory] =
    useState<Category | null>(null);

  const [selectedSongs, setSelectedSongs] = useState<Song[]>([]);
  const [categoryName, setCategoryName] = useState("");

  // ============================================================
  // AUTHENTICATION
  // ============================================================

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/");
        return;
      }

      try {
        // IMPORTANT:
        // Only read the current user's admin document.
        // This matches the current Firestore security rules.
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

        await loadData();
      } catch (err) {
        console.error("Category authentication error:", err);
        setError("Unable to verify administrator access.");
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  // ============================================================
  // LOAD DATABASE DATA
  // ============================================================

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [categorySnapshot, songSnapshot] = await Promise.all([
        getDocs(collection(db, "categories")),
        getDocs(collection(db, "shared_songs")),
      ]);

      // ONLY categories from Firestore.
      // No default or hardcoded categories.
      const categoryData: Category[] = categorySnapshot.docs
        .map((item) => ({
          id: item.id,
          ...(item.data() as Omit<Category, "id">),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const songData: Song[] = songSnapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Song, "id">),
      }));

      setCategories(categoryData);
      setSongs(songData);
    } catch (err) {
      console.error("Failed to load categories:", err);
      setError("Failed to load categories from the database.");
    } finally {
      setLoading(false);
    }
  }

  // ============================================================
  // SONG COUNT
  // ============================================================

  function getSongCount(categoryName: string) {
    return songs.filter(
      (song) => (song.category || "").trim() === categoryName.trim()
    ).length;
  }

  // ============================================================
  // SEARCH
  // ============================================================

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return categories;
    }

    return categories.filter((category) =>
      category.name.toLowerCase().includes(query)
    );
  }, [categories, search]);

  // ============================================================
  // ADD CATEGORY
  // ============================================================

  function openAddModal() {
    setCategoryName("");
    setError("");
    setShowAddModal(true);
  }

  async function handleAddCategory() {
    const name = categoryName.trim();

    if (!name) {
      setError("Please enter a category name.");
      return;
    }

    const duplicate = categories.some(
      (category) => category.name.trim().toLowerCase() === name.toLowerCase()
    );

    if (duplicate) {
      setError("This category already exists.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const newCategory = await addDoc(collection(db, "categories"), {
        name,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const category: Category = {
        id: newCategory.id,
        name,
      };

      setCategories((current) =>
        [...current, category].sort((a, b) => a.name.localeCompare(b.name))
      );

      setShowAddModal(false);
      setCategoryName("");
    } catch (err) {
      console.error("Add category error:", err);
      setError("Unable to add the category.");
    } finally {
      setSaving(false);
    }
  }

  // ============================================================
  // EDIT CATEGORY
  // ============================================================

  function openEditModal(category: Category) {
    setSelectedCategory(category);
    setCategoryName(category.name);
    setError("");
    setShowEditModal(true);
  }

  async function handleEditCategory() {
    if (!selectedCategory) return;

    const newName = categoryName.trim();

    if (!newName) {
      setError("Please enter a category name.");
      return;
    }

    if (newName === selectedCategory.name.trim()) {
      setShowEditModal(false);
      return;
    }

    const duplicate = categories.some(
      (category) =>
        category.id !== selectedCategory.id &&
        category.name.trim().toLowerCase() === newName.toLowerCase()
    );

    if (duplicate) {
      setError("Another category already has this name.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const affectedSongs = songs.filter(
        (song) =>
          (song.category || "").trim() === selectedCategory.name.trim()
      );

      const batch = writeBatch(db);

      // Update category document.
      const categoryRef = doc(db, "categories", selectedCategory.id);

      batch.update(categoryRef, {
        name: newName,
        updatedAt: serverTimestamp(),
      });

      // Update every song using the old category.
      affectedSongs.forEach((song) => {
        const songRef = doc(db, "shared_songs", song.id);

        batch.update(songRef, {
          category: newName,
        });
      });

      await batch.commit();

      // Update category in local state.
      setCategories((current) =>
        current
          .map((category) =>
            category.id === selectedCategory.id
              ? {
                  ...category,
                  name: newName,
                }
              : category
          )
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      // Update songs in local state.
      setSongs((current) =>
        current.map((song) =>
          (song.category || "").trim() === selectedCategory.name.trim()
            ? {
                ...song,
                category: newName,
              }
            : song
        )
      );

      setShowEditModal(false);
      setSelectedCategory(null);
      setCategoryName("");
    } catch (err) {
      console.error("Edit category error:", err);
      setError(
        "Unable to rename the category. Please check your Firestore permissions."
      );
    } finally {
      setSaving(false);
    }
  }

  // ============================================================
  // DELETE CATEGORY
  // ============================================================

  async function handleDeleteCategory(category: Category) {
    const count = getSongCount(category.name);

    let confirmed = false;

    if (count > 0) {
      confirmed = window.confirm(
        `"${category.name}" contains ${count} song${
          count === 1 ? "" : "s"
        }.\n\nDeleting this category will NOT delete the songs.\n\nDo you want to delete the category?`
      );
    } else {
      confirmed = window.confirm(
        `Delete the category "${category.name}"?\n\nThis category has no songs.`
      );
    }

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "categories", category.id));

      setCategories((current) =>
        current.filter((item) => item.id !== category.id)
      );
    } catch (err) {
      console.error("Delete category error:", err);

      alert(
        "Unable to delete the category. Please check your Firestore permissions."
      );
    }
  }

  // ============================================================
  // VIEW CATEGORY SONGS
  // ============================================================

  function openSongs(category: Category) {
    const categorySongs = songs.filter(
      (song) =>
        (song.category || "").trim() === category.name.trim()
    );

    setSelectedCategory(category);
    setSelectedSongs(categorySongs);
    setShowSongsModal(true);
  }

  // ============================================================
  // FORMAT DATE
  // ============================================================

  function formatDate(timestamp: any) {
    if (!timestamp) return "—";

    try {
      if (timestamp.toDate) {
        return timestamp.toDate().toLocaleDateString();
      }

      if (timestamp.seconds) {
        return new Date(timestamp.seconds * 1000).toLocaleDateString();
      }

      return "—";
    } catch {
      return "—";
    }
  }

  // ============================================================
  // MAIN UI
  // ============================================================

  return (
    <main className="min-h-screen bg-slate-100">
      {/* HEADER */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <div>
            <button
              onClick={() => router.push("/dashboard")}
              className="mb-2 text-sm font-medium text-emerald-600 hover:text-emerald-700"
            >
              ← Back to Dashboard
            </button>

            <h1 className="text-2xl font-bold text-slate-900">
              Category Management
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Manage categories from your Firestore database.
            </p>
          </div>

          <button
            onClick={openAddModal}
            className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            + Add Category
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* STATS */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Database Categories
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {categories.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Total Songs
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {songs.length}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              Categories In Use
            </p>

            <p className="mt-2 text-3xl font-bold text-emerald-600">
              {
                categories.filter(
                  (category) => getSongCount(category.name) > 0
                ).length
              }
            </p>
          </div>
        </div>

        {/* SEARCH + REFRESH */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search categories..."
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pl-10 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />

            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              🔎
            </span>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "↻ Refresh"}
          </button>
        </div>

        {/* ERROR */}
        {error && !showAddModal && !showEditModal && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* LOADING */}
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />

            <p className="mt-4 text-sm text-slate-500">
              Loading categories from database...
            </p>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <div className="text-4xl">📂</div>

            <h2 className="mt-4 text-lg font-semibold text-slate-900">
              {search ? "No categories found" : "No categories in database"}
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              {search
                ? "Try a different search."
                : "Create your first category using the Add Category button."}
            </p>

            {!search && (
              <button
                onClick={openAddModal}
                className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                + Add Category
              </button>
            )}
          </div>
        ) : (
          <>
            {/* DESKTOP TABLE */}
            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Category
                    </th>

                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Songs
                    </th>

                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Created
                    </th>

                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredCategories.map((category) => {
                    const count = getSongCount(category.name);

                    return (
                      <tr
                        key={category.id}
                        className="transition hover:bg-slate-50"
                      >
                        <td className="px-6 py-5">
                          <button
                            onClick={() => openSongs(category)}
                            className="text-left"
                          >
                            <div className="font-semibold text-slate-900 hover:text-emerald-600">
                              {category.name}
                            </div>

                            <div className="mt-1 text-xs text-slate-400">
                              ID: {category.id}
                            </div>
                          </button>
                        </td>

                        <td className="px-6 py-5">
                          <button
                            onClick={() => openSongs(category)}
                            className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                          >
                            {count} {count === 1 ? "song" : "songs"}
                          </button>
                        </td>

                        <td className="px-6 py-5 text-sm text-slate-500">
                          {formatDate(category.createdAt)}
                        </td>

                        <td className="px-6 py-5">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openSongs(category)}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                              View Songs
                            </button>

                            <button
                              onClick={() => openEditModal(category)}
                              className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                            >
                              Edit
                            </button>

                            <button
                              onClick={() => handleDeleteCategory(category)}
                              className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* MOBILE CARDS */}
            <div className="space-y-3 md:hidden">
              {filteredCategories.map((category) => {
                const count = getSongCount(category.name);

                return (
                  <div
                    key={category.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <button
                        onClick={() => openSongs(category)}
                        className="min-w-0 text-left"
                      >
                        <h2 className="break-words text-lg font-bold text-slate-900">
                          {category.name}
                        </h2>

                        <p className="mt-1 text-xs text-slate-400">
                          Created {formatDate(category.createdAt)}
                        </p>
                      </button>

                      <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        {count} songs
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <button
                        onClick={() => openSongs(category)}
                        className="rounded-lg bg-slate-100 px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                      >
                        Songs
                      </button>

                      <button
                        onClick={() => openEditModal(category)}
                        className="rounded-lg bg-blue-50 px-2 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => handleDeleteCategory(category)}
                        className="rounded-lg bg-red-50 px-2 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ========================================================
          ADD CATEGORY MODAL
          ======================================================== */}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5">
              <h2 className="text-xl font-bold text-slate-900">
                Add Category
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Create a new category in the database.
              </p>
            </div>

            <label className="mb-2 block text-sm font-medium text-slate-700">
              Category Name
            </label>

            <input
              autoFocus
              type="text"
              value={categoryName}
              onChange={(e) => {
                setCategoryName(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleAddCategory();
                }
              }}
              placeholder="Enter category name"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />

            {error && (
              <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setError("");
                }}
                disabled={saving}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                onClick={handleAddCategory}
                disabled={saving}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "Adding..." : "Add Category"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          EDIT CATEGORY MODAL
          ======================================================== */}

      {showEditModal && selectedCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5">
              <h2 className="text-xl font-bold text-slate-900">
                Edit Category
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Renaming this category will also update all songs using it.
              </p>
            </div>

            <div className="mb-4 rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Current Category
              </p>

              <p className="mt-1 font-semibold text-slate-900">
                {selectedCategory.name}
              </p>

              <p className="mt-1 text-sm text-slate-500">
                {getSongCount(selectedCategory.name)} songs will be updated.
              </p>
            </div>

            <label className="mb-2 block text-sm font-medium text-slate-700">
              New Category Name
            </label>

            <input
              autoFocus
              type="text"
              value={categoryName}
              onChange={(e) => {
                setCategoryName(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleEditCategory();
                }
              }}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />

            {error && (
              <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedCategory(null);
                  setError("");
                }}
                disabled={saving}
                className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                onClick={handleEditCategory}
                disabled={saving}
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          CATEGORY SONGS MODAL
          ======================================================== */}

      {showSongsModal && selectedCategory && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 px-4 py-8">
          <div className="mx-auto w-full max-w-4xl rounded-2xl bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-sm font-medium text-emerald-600">
                  Category
                </p>

                <h2 className="mt-1 text-xl font-bold text-slate-900">
                  {selectedCategory.name}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {selectedSongs.length}{" "}
                  {selectedSongs.length === 1 ? "song" : "songs"}
                </p>
              </div>

              <button
                onClick={() => {
                  setShowSongsModal(false);
                  setSelectedCategory(null);
                  setSelectedSongs([]);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-500 hover:bg-slate-200"
              >
                ×
              </button>
            </div>

            {/* Songs */}
            <div className="max-h-[70vh] overflow-y-auto p-6">
              {selectedSongs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center">
                  <div className="text-4xl">🎵</div>

                  <h3 className="mt-4 font-semibold text-slate-900">
                    No songs in this category
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    Songs assigned to this category will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedSongs.map((song, index) => (
                    <div
                      key={song.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-emerald-200 hover:bg-emerald-50/30"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-sm font-bold text-emerald-700">
                          {index + 1}
                        </div>

                        <div className="min-w-0 flex-1">
                          <h3 className="break-words font-semibold text-slate-900">
                            {song.title || "Untitled Song"}
                          </h3>

                          {song.lyrics && (
                            <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm leading-6 text-slate-500">
                              {song.lyrics}
                            </p>
                          )}

                          <div className="mt-3 flex flex-wrap gap-2">
                            {song.youtubeUrl && (
                              <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600">
                                ▶ YouTube
                              </span>
                            )}

                            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-500">
                              ID: {song.id}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end border-t border-slate-200 px-6 py-4">
              <button
                onClick={() => {
                  setShowSongsModal(false);
                  setSelectedCategory(null);
                  setSelectedSongs([]);
                }}
                className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}