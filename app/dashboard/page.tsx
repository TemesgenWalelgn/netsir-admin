
"use client";

import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";

type Song = {
  title?: string;
  lyrics?: string;
  category?: string;
  youtubeUrl?: string;
};

export default function DashboardPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const [songCount, setSongCount] = useState(0);
  const [categoryCount, setCategoryCount] = useState(0);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/");
        return;
      }

      try {
        // Check only the logged-in user's admin document.
        const adminRef = doc(db, "admins", user.uid);
        const adminSnap = await getDoc(adminRef);

        if (!adminSnap.exists()) {
          setError("You are not authorized to access the Netsir Admin.");
          await signOut(auth);
          router.replace("/");
          return;
        }

        const adminData = adminSnap.data();

        if (adminData.role !== "admin") {
          setError("You are not authorized to access the Netsir Admin.");
          await signOut(auth);
          router.replace("/");
          return;
        }

        setEmail(user.email ?? "");
        setAuthorized(true);
        setChecking(false);

        await loadDashboardData();
      } catch (err) {
        console.error("Admin verification failed:", err);

        setError("Unable to verify administrator access.");
        await signOut(auth);
        router.replace("/");
      }
    });

    return () => unsubscribe();
  }, [router]);

  async function loadDashboardData() {
    setLoadingData(true);

    try {
      const songsSnapshot = await getDocs(
        collection(db, "shared_songs")
      );

      const songs: Song[] = songsSnapshot.docs.map(
        (doc) => doc.data() as Song
      );

      const categories = new Set(
        songs
          .map((song) => song.category?.trim())
          .filter(
            (category): category is string => Boolean(category)
          )
      );

      setSongCount(songs.length);
      setCategoryCount(categories.size);
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setLoadingData(false);
    }
  }

  async function handleRefresh() {
    await loadDashboardData();
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
        <div className="rounded-2xl bg-white p-8 text-center shadow-xl">
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
      {/* Header */}
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Netsir Admin
            </h1>

            <p className="text-sm text-slate-500">
              ነጽር ዝማሬ Database Management
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={loadingData}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loadingData ? "Refreshing..." : "Refresh"}
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

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900">
            Welcome to Netsir Admin 👋
          </h2>

          <p className="mt-2 text-slate-500">
            Signed in as {email}
          </p>
        </div>

        {/* Statistics */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Songs */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  Shared Songs
                </p>

                <p className="mt-3 text-4xl font-bold text-slate-900">
                  {loadingData ? "..." : songCount}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-xl">
                🎵
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-400">
              Songs currently in Firestore
            </p>
          </div>

          {/* Categories */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  Categories
                </p>

                <p className="mt-3 text-4xl font-bold text-slate-900">
                  {loadingData ? "..." : categoryCount}
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-xl">
                📂
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-400">
              Unique song categories
            </p>
          </div>

          {/* Users */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  Users
                </p>

                <p className="mt-3 text-4xl font-bold text-slate-900">
                  —
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 text-xl">
                👥
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-400">
              Coming later
            </p>
          </div>

          {/* Admin Status */}
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  Admin Status
                </p>

                <p className="mt-3 text-2xl font-bold text-emerald-600">
                  Active
                </p>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-xl">
                ✓
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-400">
              Administrator access verified
            </p>
          </div>
        </div>

        {/* Management Tools */}
        <div className="mt-8">
          <h3 className="mb-4 text-lg font-bold text-slate-900">
            Management
          </h3>

          <div className="grid gap-5 md:grid-cols-2">
            {/* Songs Management */}
            <button
              onClick={() => router.push("/dashboard/songs")}
              className="group rounded-2xl bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-2xl">
                  🎵
                </div>

                <span className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-emerald-500">
                  →
                </span>
              </div>

              <h4 className="mt-5 text-lg font-bold text-slate-900">
                Songs Management
              </h4>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                View and search songs stored in the Netsir Firestore
                database.
              </p>

              <p className="mt-4 text-sm font-semibold text-emerald-600">
                Open Songs →
              </p>
            </button>

            {/* Future Tools */}
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-2xl">
                ⚙️
              </div>

              <h4 className="mt-5 text-lg font-bold text-slate-900">
                More Management Tools
              </h4>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                Categories, users, settings, and additional admin
                tools will be added here.
              </p>

              <p className="mt-4 text-sm font-medium text-slate-400">
                Coming soon
              </p>
            </div>
          </div>
        </div>

        {/* Database Overview */}
        <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">
            Database Overview
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            The admin dashboard is connected to your existing Netsir
            Firestore database. Current dashboard statistics are
            read-only and do not modify your existing song data.
          </p>
        </div>
      </div>
    </main>
  );
}