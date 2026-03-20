"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { auth, googleProvider, isFirebaseConfigured } from "@/lib/firebase";
import { migrateGuestDataToUser } from "@/lib/db";

export interface AuthContextValue {
  user: User | null;
  uid: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  isConfigured: boolean;
  signUp: (email: string, password: string) => Promise<User>;
  signIn: (email: string, password: string) => Promise<User>;
  signInWithGoogle: () => Promise<User>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function getMissingConfigError() {
  return new Error("Firebase Auth 尚未配置，请先补全 NEXT_PUBLIC_FIREBASE_* 环境变量。");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      void (async () => {
        if (nextUser) {
          try {
            await migrateGuestDataToUser(nextUser.uid);
          } catch (error) {
            console.error("Failed to migrate guest notebook data:", error);
          }
        }

        if (!isMounted) {
          return;
        }

        setUser(nextUser);
        setLoading(false);
      })();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!auth) {
      throw getMissingConfigError();
    }

    const credential = await createUserWithEmailAndPassword(auth, email, password);
    return credential.user;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!auth) {
      throw getMissingConfigError();
    }

    const credential = await signInWithEmailAndPassword(auth, email, password);
    return credential.user;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!auth || !googleProvider) {
      throw getMissingConfigError();
    }

    const credential = await signInWithPopup(auth, googleProvider);
    return credential.user;
  }, []);

  const signOut = useCallback(async () => {
    if (!auth) {
      throw getMissingConfigError();
    }

    await firebaseSignOut(auth);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      uid: user?.uid ?? null,
      loading,
      isAuthenticated: Boolean(user),
      isConfigured: isFirebaseConfigured,
      signUp,
      signIn,
      signInWithGoogle,
      signOut,
    }),
    [loading, signIn, signInWithGoogle, signOut, signUp, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
