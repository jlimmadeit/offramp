import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import { setFlowstageKey } from "../lib/flowstage";

export interface User {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email_address: string | null;
  flowstage_key: string | null;
  bundle_key: string | null;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (
    firstName: string,
    lastName: string,
    email: string,
    password: string
  ) => Promise<string | null>;
  signOut: () => void;
  updateFlowstageKey: (key: string) => Promise<string | null>;
  updateBundleKey: (key: string) => Promise<string | null>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}

const STORAGE_KEY = "flowdify_user_id";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setFlowstageKey(user?.flowstage_key ?? null);
    // Drop legacy sessionStorage fallback from older builds
    sessionStorage.removeItem("flowdify_encrypted_flowstage_key");
  }, [user?.flowstage_key]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setLoading(false);
      return;
    }
    const userId = Number(stored);
    if (Number.isNaN(userId)) {
      localStorage.removeItem(STORAGE_KEY);
      setLoading(false);
      return;
    }
    supabase
      .from("users")
      .select("id, first_name, last_name, email_address, flowstage_key, bundle_key")
      .eq("id", userId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          localStorage.removeItem(STORAGE_KEY);
          setFlowstageKey(null);
        } else {
          setFlowstageKey(data.flowstage_key ?? null);
          setUser(data);
        }
        setLoading(false);
      });
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      const { data, error } = await supabase
        .from("users")
        .select("id, first_name, last_name, email_address, password, flowstage_key, bundle_key")
        .eq("email_address", email)
        .single();

      if (error || !data) return "No account found with that email.";
      if (!data.password) return "Account is missing a password. Try creating a new account.";

      try {
        const res = await fetch("/api/auth/verify-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password, hash: data.password }),
        });
        const body = await res.json().catch(() => null);
        if (!body || typeof body.valid !== "boolean") {
          return "Auth server unavailable. Run `cd flowdify && npm run dev` and open http://localhost:3000";
        }
        if (!body.valid) return "Incorrect password.";
      } catch {
        return "Auth server unavailable. Run `cd flowdify && npm run dev` and open http://localhost:3000";
      }

      const { password: _, ...userData } = data;
      setFlowstageKey(userData.flowstage_key ?? null);
      setUser(userData);
      localStorage.setItem(STORAGE_KEY, String(data.id));
      return null;
    },
    []
  );

  const signUp = useCallback(
    async (
      firstName: string,
      lastName: string,
      email: string,
      password: string
    ): Promise<string | null> => {
      const { data: existing } = await supabase
        .from("users")
        .select("id")
        .eq("email_address", email)
        .maybeSingle();

      if (existing) return "An account with that email already exists.";

      let hashedPassword: string;
      try {
        const res = await fetch("/api/auth/hash-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        if (!res.ok) return "Failed to secure password.";
        const body = await res.json();
        hashedPassword = body.hash;
      } catch {
        return "Failed to secure password.";
      }

      const { data, error } = await supabase
        .from("users")
        .insert({
          first_name: firstName,
          last_name: lastName,
          email_address: email,
          password: hashedPassword,
        })
        .select("id, first_name, last_name, email_address, flowstage_key, bundle_key")
        .single();

      if (error || !data) return error?.message ?? "Sign up failed.";

      setFlowstageKey(data.flowstage_key ?? null);
      setUser(data);
      localStorage.setItem(STORAGE_KEY, String(data.id));
      return null;
    },
    []
  );

  const signOut = useCallback(() => {
    setFlowstageKey(null);
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const updateFlowstageKey = useCallback(
    async (key: string): Promise<string | null> => {
      if (!user) return "Not signed in.";
      const trimmed = key.trim();

      if (!trimmed) {
        const { error } = await supabase
          .from("users")
          .update({ flowstage_key: null })
          .eq("id", user.id);
        if (error) return error.message;
        setFlowstageKey(null);
        setUser((prev) => (prev ? { ...prev, flowstage_key: null } : prev));
        return null;
      }

      try {
        const res = await fetch("/api/encrypt-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: trimmed }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return body.error ?? "Encryption failed.";
        }
        const { encrypted } = await res.json();

        const { error } = await supabase
          .from("users")
          .update({ flowstage_key: encrypted })
          .eq("id", user.id);
        if (error) return error.message;
        setFlowstageKey(encrypted);
        setUser((prev) => (prev ? { ...prev, flowstage_key: encrypted } : prev));
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : "Failed to save key.";
      }
    },
    [user]
  );

  const updateBundleKey = useCallback(
    async (key: string): Promise<string | null> => {
      if (!user) return "Not signed in.";
      const trimmed = key.trim();

      if (!trimmed) {
        const { error } = await supabase
          .from("users")
          .update({ bundle_key: null })
          .eq("id", user.id);
        if (error) return error.message;
        setUser((prev) => (prev ? { ...prev, bundle_key: null } : prev));
        return null;
      }

      try {
        const res = await fetch("/api/encrypt-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: trimmed }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return body.error ?? "Encryption failed.";
        }
        const { encrypted } = await res.json();

        const { error } = await supabase
          .from("users")
          .update({ bundle_key: encrypted })
          .eq("id", user.id);
        if (error) return error.message;
        setUser((prev) => (prev ? { ...prev, bundle_key: encrypted } : prev));
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : "Failed to save key.";
      }
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{ user, loading, signIn, signUp, signOut, updateFlowstageKey, updateBundleKey }}
    >
      {children}
    </AuthContext.Provider>
  );
}
