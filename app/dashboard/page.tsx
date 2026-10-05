
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

import {
  Music2,
  FolderOpen,
  RefreshCw,
  Plus,
  ArrowRight,
  Clock3,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  ExternalLink,
} from "lucide-react";

import { auth, db } from "@/lib/firebase";

type Song = {
  id: string;
  title: string;
  lyrics: string;
  category: string;
  youtubeUrl?: string;
  createdAt?: Timestamp | null;
  timestamp?: Timestamp | null;
};

type DashboardStats = {
  totalSongs: number;
  totalCategories: number;
  songsWithAudio: number;
  recentSongs: Song[];
};

export default function DashboardPage() {
  const router = useRouter();

  const [stats, setStats] = useState<DashboardStats>({
    totalSongs: 0,
    totalCategories: 0,
    songsWithAudio: 0,
    recentSongs: [],
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const user = auth.currentUser;

        if (!user) {
          router.replace("/");
          return;
        }

        // Verify admin account.
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

        const [songsSnapshot, categoriesSnapshot] = await Promise.all([
          getDocs(collection(db, "shared_songs")),
          getDocs(collection(db, "categories")),
        ]);

        const songs: Song[] = songsSnapshot.docs.map((songDoc) => {
          const data = songDoc.data();

          return {
            id: songDoc.id,
            title: data.title || "Untitled Song",
            lyrics: data.lyrics || "",
            category: data.category || "Uncategorized",
            youtubeUrl: data.youtubeUrl || "",
            createdAt: data.createdAt || null,
            timestamp: data.timestamp || null,
          };
        });

        const songsWithAudio = songs.filter(
          (song) => song.youtubeUrl?.trim()
        ).length;

        const sortedSongs = [...songs].sort((a, b) => {
          const getTime = (song: Song) => {
            const date = song.createdAt || song.timestamp;

            if (!date) return 0;

            if (date instanceof Timestamp) {
              return date.toMillis();
            }

            return 0;
          };

          return getTime(b) - getTime(a);
        });

        setStats({
          totalSongs: songs.length,
          totalCategories: categoriesSnapshot.size,
          songsWithAudio,
          recentSongs: sortedSongs.slice(0, 6),
        });
      } catch (err) {
        console.error("Dashboard loading error:", err);
        setError("Unable to load dashboard data.");
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

      loadDashboard();
    });

    return () => unsubscribe();
  }, [loadDashboard, router]);

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

  function getInitial(title: string) {
    return title.trim().charAt(0) || "♪";
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 w-48 rounded-lg bg-slate-200" />
          <div className="mt-3 h-4 w-72 rounded bg-slate-200" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white"
            />
          ))}
        </div>

        <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* Page heading */}
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-600">
            <BarChart3 size={17} />
            Overview
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Welcome to Netsir Admin
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Manage your songs, categories, and shared content.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              size={16}
              className={refreshing ? "animate-spin" : ""}
            />
            Refresh
          </button>

          <Link
            href="/dashboard/songs"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-200 transition hover:bg-emerald-700"
          >
            <Plus size={17} />
            Add Song
          </Link>
        </div>
      </section>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* Statistics */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Total songs */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Total Songs
              </p>

              <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
                {stats.totalSongs}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Shared songs in database
              </p>
            </div>

            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Music2 size={21} />
            </div>
          </div>
        </div>

        {/* Categories */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Categories
              </p>

              <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
                {stats.totalCategories}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Available categories
              </p>
            </div>

            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <FolderOpen size={21} />
            </div>
          </div>
        </div>

        {/* Audio */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Songs With Audio
              </p>

              <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
                {stats.songsWithAudio}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Songs with YouTube links
              </p>
            </div>

            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <ExternalLink size={21} />
            </div>
          </div>
        </div>

        {/* Audio percentage */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Audio Coverage
              </p>

              <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
                {stats.totalSongs > 0
                  ? Math.round(
                      (stats.songsWithAudio / stats.totalSongs) * 100
                    )
                  : 0}
                %
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Songs connected to audio
              </p>
            </div>

            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <CheckCircle2 size={21} />
            </div>
          </div>
        </div>
      </section>

      {/* Main content */}
      <section className="grid gap-6 xl:grid-cols-3">
        {/* Recent songs */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-6">
            <div>
              <h2 className="font-semibold text-slate-900">
                Recent Songs
              </h2>

              <p className="mt-1 text-xs text-slate-400">
                Latest songs added to Netsir
              </p>
            </div>

            <Link
              href="/dashboard/songs"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700"
            >
              View all
              <ArrowRight size={15} />
            </Link>
          </div>

          {stats.recentSongs.length === 0 ? (
            <div className="flex min-h-60 flex-col items-center justify-center px-6 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Music2 size={22} />
              </div>

              <p className="font-medium text-slate-700">
                No songs yet
              </p>

              <p className="mt-1 text-sm text-slate-400">
                Add your first song to get started.
              </p>

              <Link
                href="/dashboard/songs"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                <Plus size={16} />
                Add Song
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {stats.recentSongs.map((song) => (
                <div
                  key={song.id}
                  className="flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50 sm:px-6"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-sm font-bold text-emerald-700">
                    {getInitial(song.title)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {song.title}
                    </p>

                    <div className="mt-1 flex items-center gap-2">
                      <span className="max-w-[160px] truncate rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                        {song.category}
                      </span>

                      {song.youtubeUrl && (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-600">
                          <CheckCircle2 size={12} />
                          Audio
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
                    <Clock3 size={13} />
                    {formatDate(song)}
                  </div>

                  <Link
                    href="/dashboard/songs"
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    title="Open Songs"
                  >
                    <ArrowRight size={17} />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5">
            <h2 className="font-semibold text-slate-900">
              Quick Actions
            </h2>

            <p className="mt-1 text-xs text-slate-400">
              Common management tasks
            </p>
          </div>

          <div className="space-y-3">
            <Link
              href="/dashboard/songs"
              className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3.5 transition hover:border-emerald-200 hover:bg-emerald-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-white">
                <Plus size={19} />
              </div>

              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">
                  Add New Song
                </p>

                <p className="mt-0.5 text-xs text-slate-400">
                  Create a new song
                </p>
              </div>

              <ArrowRight
                size={16}
                className="text-slate-300 transition group-hover:text-emerald-500"
              />
            </Link>

            <Link
              href="/dashboard/songs"
              className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3.5 transition hover:border-blue-200 hover:bg-blue-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-white">
                <Music2 size={19} />
              </div>

              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">
                  Manage Songs
                </p>

                <p className="mt-0.5 text-xs text-slate-400">
                  View and edit songs
                </p>
              </div>

              <ArrowRight
                size={16}
                className="text-slate-300 transition group-hover:text-blue-500"
              />
            </Link>

            <Link
              href="/dashboard/categories"
              className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3.5 transition hover:border-violet-200 hover:bg-violet-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-600 group-hover:bg-white">
                <FolderOpen size={19} />
              </div>

              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">
                  Manage Categories
                </p>

                <p className="mt-0.5 text-xs text-slate-400">
                  Organize your songs
                </p>
              </div>

              <ArrowRight
                size={16}
                className="text-slate-300 transition group-hover:text-violet-500"
              />
            </Link>
          </div>

          {/* Progress */}
          <div className="mt-6 rounded-xl bg-slate-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">
                Audio coverage
              </span>

              <span className="text-xs font-semibold text-slate-800">
                {stats.totalSongs > 0
                  ? Math.round(
                      (stats.songsWithAudio / stats.totalSongs) * 100
                    )
                  : 0}
                %
              </span>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{
                  width: `${
                    stats.totalSongs > 0
                      ? Math.round(
                          (stats.songsWithAudio / stats.totalSongs) * 100
                        )
                      : 0
                  }%`,
                }}
              />
            </div>

            <p className="mt-2 text-[11px] text-slate-400">
              {stats.songsWithAudio} of {stats.totalSongs} songs have
              audio links.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}