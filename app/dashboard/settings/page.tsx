"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import {
  Settings,
  ShieldCheck,
  UserRound,
  Music2,
  Database,
  RefreshCw,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Info,
} from "lucide-react";

import { auth, db } from "@/lib/firebase";

export default function SettingsPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Administrator");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function loadSettings(showRefresh = false) {
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

      const adminSnapshot = await getDoc(
        doc(db, "admins", user.uid)
      );

      if (
        !adminSnapshot.exists() ||
        adminSnapshot.data().role !== "admin"
      ) {
        router.replace("/");
        return;
      }

      setEmail(user.email || "No email available");
      setRole(adminSnapshot.data().role || "Administrator");
    } catch (err) {
      console.error("Settings loading error:", err);
      setError("Unable to load account settings. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/");
        return;
      }

      loadSettings();
    });

    return () => unsubscribe();
  }, [router]);

  async function handleSignOut() {
    try {
      await signOut(auth);
      router.replace("/");
    } catch (err) {
      console.error("Sign out error:", err);
      setError("Unable to sign out. Please try again.");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-40 animate-pulse rounded-2xl bg-white" />
        <div className="h-64 animate-pulse rounded-2xl bg-white" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Page heading */}
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-600">
            <Settings size={17} />
            Administration
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Settings
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Manage your Netsir admin account and application information.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadSettings(true)}
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

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Account overview */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <UserRound size={21} />
            </div>

            <div>
              <h2 className="font-bold text-slate-900">
                Admin Account
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Your current account information
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-400">
              Email Address
            </p>
            <p className="mt-2 break-all text-sm font-semibold text-slate-800">
              {email}
            </p>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-medium text-slate-400">
              Account Role
            </p>

            <div className="mt-2 flex items-center gap-2">
              <ShieldCheck size={17} className="text-emerald-600" />
              <span className="text-sm font-semibold capitalize text-slate-800">
                {role}
              </span>
              <CheckCircle2
                size={15}
                className="text-emerald-600"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 sm:col-span-2">
            <p className="text-xs font-medium text-slate-400">
              Authentication
            </p>
            <p className="mt-2 text-sm font-medium text-slate-700">
              Firebase Authentication
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Your account is managed through Firebase.
            </p>
          </div>
        </div>
      </section>

      {/* Application information */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Info size={21} />
            </div>

            <div>
              <h2 className="font-bold text-slate-900">
                Application Information
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Details about your application
              </p>
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          <div className="flex items-center gap-4 p-5 sm:px-6">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Music2 size={20} />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800">
                Netsir
              </p>
              <p className="mt-1 text-xs text-slate-400">
                ነጽር ዝማሬ — Song lyrics application
              </p>
            </div>

            <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              Active
            </span>
          </div>

          <div className="flex items-center gap-4 p-5 sm:px-6">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <Database size={20} />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800">
                Cloud Database
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Firebase Firestore
              </p>
            </div>

            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              Connected service
            </span>
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <ShieldCheck size={20} />
          </div>

          <div>
            <h2 className="font-bold text-emerald-950">
              Account Security
            </h2>
            <p className="mt-1 text-sm leading-6 text-emerald-800">
              Only authorized administrators should access the
              dashboard. Keep your account credentials secure and
              sign out when using a shared computer.
            </p>
          </div>
        </div>
      </section>

      {/* Sign out */}
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:p-6">
        <div>
          <h2 className="font-bold text-slate-900">
            Sign Out
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            End your current admin session.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
        >
          <LogOut size={17} />
          Sign Out
        </button>
      </section>
    </div>
  );
}