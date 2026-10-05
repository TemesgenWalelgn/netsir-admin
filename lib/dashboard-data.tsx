
"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

import { auth, db } from "@/lib/firebase";

export type DashboardSong = {
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

export type DashboardCategory = {
  id: string;
  name: string;
  createdAt?: any;
  updatedAt?: any;
};

type DashboardDataContextType = {
  songs: DashboardSong[];
  categories: DashboardCategory[];
  loading: boolean;
  error: string;

  refreshSongs: () => Promise<void>;
  refreshCategories: () => Promise<void>;
  refreshData: () => Promise<void>;

  setSongs: React.Dispatch<
    React.SetStateAction<DashboardSong[]>
  >;

  setCategories: React.Dispatch<
    React.SetStateAction<DashboardCategory[]>
  >;
};

const DashboardDataContext =
  createContext<DashboardDataContextType | undefined>(undefined);

export function DashboardDataProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [songs, setSongs] = useState<DashboardSong[]>([]);
  const [categories, setCategories] = useState<
    DashboardCategory[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSongs = useCallback(async () => {
    const snapshot = await getDocs(
      collection(db, "shared_songs")
    );

    const loadedSongs: DashboardSong[] = snapshot.docs.map(
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

    setSongs(loadedSongs);
  }, []);

  const loadCategories = useCallback(async () => {
    const snapshot = await getDocs(
      collection(db, "categories")
    );

    const loadedCategories: DashboardCategory[] =
      snapshot.docs
        .map((categoryDoc) => {
          const data = categoryDoc.data();

          return {
            id: categoryDoc.id,
            name: data.name || "",
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        })
        .sort((a, b) =>
          a.name.localeCompare(b.name, "am")
        );

    setCategories(loadedCategories);
  }, []);

  const refreshSongs = useCallback(async () => {
    setError("");

    try {
      await loadSongs();
    } catch (err) {
      console.error("Songs refresh error:", err);
      setError("Unable to refresh songs.");
      throw err;
    }
  }, [loadSongs]);

  const refreshCategories = useCallback(async () => {
    setError("");

    try {
      await loadCategories();
    } catch (err) {
      console.error("Categories refresh error:", err);
      setError("Unable to refresh categories.");
      throw err;
    }
  }, [loadCategories]);

  const refreshData = useCallback(async () => {
    setError("");

    try {
      await Promise.all([
        loadSongs(),
        loadCategories(),
      ]);
    } catch (err) {
      console.error(
        "Dashboard data refresh error:",
        err
      );

      setError(
        "Unable to refresh dashboard data."
      );

      throw err;
    }
  }, [loadSongs, loadCategories]);

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (!user) {
          if (active) {
            setSongs([]);
            setCategories([]);
            setLoading(false);
          }

          return;
        }

        try {
          setLoading(true);
          setError("");

          /*
           * Verify the current user's own admin document.
           * We intentionally do NOT read the entire admins collection.
           */
          const adminRef = doc(
            db,
            "admins",
            user.uid
          );

          const adminSnapshot = await getDoc(
            adminRef
          );

          if (!adminSnapshot.exists()) {
            if (active) {
              setSongs([]);
              setCategories([]);
              setError(
                "Admin access could not be verified."
              );
              setLoading(false);
            }

            return;
          }

          const adminData = adminSnapshot.data();

          if (adminData.role !== "admin") {
            if (active) {
              setSongs([]);
              setCategories([]);
              setError(
                "You do not have admin access."
              );
              setLoading(false);
            }

            return;
          }

          /*
           * This is the ONE initial dashboard load.
           *
           * shared_songs is loaded here and then shared
           * between Songs and Categories.
           */
          await Promise.all([
            loadSongs(),
            loadCategories(),
          ]);

          if (active) {
            setLoading(false);
          }
        } catch (err) {
          console.error(
            "Dashboard data loading error:",
            err
          );

          if (active) {
            setError(
              "Unable to load dashboard data."
            );
            setLoading(false);
          }
        }
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [loadSongs, loadCategories]);

  return (
    <DashboardDataContext.Provider
      value={{
        songs,
        categories,
        loading,
        error,
        refreshSongs,
        refreshCategories,
        refreshData,
        setSongs,
        setCategories,
      }}
    >
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardData() {
  const context = useContext(
    DashboardDataContext
  );

  if (!context) {
    throw new Error(
      "useDashboardData must be used inside DashboardDataProvider"
    );
  }

  return context;
}
