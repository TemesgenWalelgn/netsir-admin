"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { DashboardDataProvider } from "@/lib/dashboard-data";

import {
  LayoutDashboard,
  Music2,
  FolderOpen,
  Flag,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";

type DashboardLayoutProps = {
  children: ReactNode;
};

const navigation = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Songs",
    href: "/dashboard/songs",
    icon: Music2,
  },
  {
    name: "Categories",
    href: "/dashboard/categories",
    icon: FolderOpen,
  },
  {
    name: "Reports",
    href: "/dashboard/reports",
    icon: Flag,
  },
  {
    name: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
  },
];

export default function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [email, setEmail] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace("/");
        return;
      }

      setEmail(user.email || "Admin");
      setCheckingAuth(false);
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    await signOut(auth);
    router.replace("/");
  }

  if (checkingAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-lg font-bold text-white shadow-lg shadow-emerald-200">
            N
          </div>

          <p className="text-sm text-slate-500">
            Loading Netsir Admin...
          </p>
        </div>
      </main>
    );
  }

  const currentPage =
    navigation.find((item) => item.href === pathname)?.name ||
    "Dashboard";

  return (
    <DashboardDataProvider>
      <div className="min-h-screen bg-slate-50">
        {mobileOpen && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden"
          />
        )}

        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform duration-300 lg:translate-x-0 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-20 items-center justify-between border-b border-slate-100 px-6">
            <Link
              href="/dashboard"
              className="flex items-center gap-3"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-lg font-bold text-white shadow-lg shadow-emerald-100">
                N
              </div>

              <div>
                <h1 className="text-base font-bold tracking-tight text-slate-900">
                  Netsir Admin
                </h1>

                <p className="text-xs text-slate-400">
                  ነጽር ዝማሬ
                </p>
              </div>
            </Link>

            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:hidden"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-6">
            <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Management
            </p>

            <nav className="space-y-1.5">
              {navigation.map((item) => {
                const Icon = item.icon;

                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" &&
                    pathname.startsWith(`${item.href}/`));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                      isActive
                        ? "bg-emerald-50 text-emerald-700"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
                        isActive
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                      }`}
                    >
                      <Icon size={18} strokeWidth={2} />
                    </span>

                    <span className="flex-1">{item.name}</span>

                    {isActive && (
                      <ChevronRight
                        size={16}
                        className="text-emerald-500"
                      />
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-8 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
                  <ShieldCheck size={17} />
                </div>

                <div>
                  <p className="text-xs font-semibold text-emerald-900">
                    Admin Access
                  </p>

                  <p className="text-[10px] text-emerald-600">
                    Full management
                  </p>
                </div>
              </div>

              <p className="truncate text-xs text-emerald-800">
                {email}
              </p>
            </div>
          </div>

          <div className="border-t border-slate-100 p-4">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-600"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 transition group-hover:bg-red-100">
                <LogOut size={18} />
              </span>

              Sign Out
            </button>
          </div>
        </aside>

        <div className="lg:pl-72">
          <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 shadow-sm hover:bg-slate-50 lg:hidden"
              >
                <Menu size={20} />
              </button>

              <div>
                <div className="flex items-center gap-2">
                  <span className="hidden text-sm text-slate-400 sm:inline">
                    Netsir Admin
                  </span>

                  <ChevronRight
                    size={15}
                    className="hidden text-slate-300 sm:inline"
                  />

                  <span className="text-sm font-semibold text-slate-800">
                    {currentPage}
                  </span>
                </div>

                <p className="mt-0.5 hidden text-xs text-slate-400 sm:block">
                  Manage your Netsir content
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-slate-800">
                  Administrator
                </p>

                <p className="max-w-[180px] truncate text-xs text-slate-400">
                  {email}
                </p>
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-sm font-bold text-emerald-700">
                A
              </div>
            </div>
          </header>

          <main className="min-h-[calc(100vh-5rem)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </DashboardDataProvider>
  );
}