import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";

type Mode = "sign-in" | "sign-up";

export default function AuthModal() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setEmail("");
    setPassword("");
    setFirstName("");
    setLastName("");
    setError(null);
  };

  const switchMode = (m: Mode) => {
    reset();
    setMode(m);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);

    let err: string | null;
    if (mode === "sign-in") {
      err = await signIn(email.trim(), password);
    } else {
      if (!firstName.trim() || !lastName.trim()) {
        setError("First and last name are required.");
        setBusy(false);
        return;
      }
      err = await signUp(firstName.trim(), lastName.trim(), email.trim(), password);
    }

    setBusy(false);
    if (err) setError(err);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center animate-backdrop-in bg-black/30 backdrop-blur-sm">
      <div className="w-[380px] bg-white rounded-2xl shadow-2xl animate-modal-in overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => switchMode("sign-in")}
            className={`flex-1 py-3.5 text-[13px] font-semibold tracking-tight transition-colors ${
              mode === "sign-in"
                ? "text-gray-900 border-b-2 border-gray-900"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            Sign in
          </button>
          <button
            onClick={() => switchMode("sign-up")}
            className={`flex-1 py-3.5 text-[13px] font-semibold tracking-tight transition-colors ${
              mode === "sign-up"
                ? "text-gray-900 border-b-2 border-gray-900"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            Create account
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-7 pt-6 pb-7 space-y-4">
          {mode === "sign-up" && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-[11px] font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                  First name
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  autoFocus
                  className="w-full h-10 px-3 rounded-lg bg-gray-50 border border-gray-200 text-[13px] text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-200 transition-colors"
                  placeholder="Joe"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[11px] font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                  Last name
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className="w-full h-10 px-3 rounded-lg bg-gray-50 border border-gray-200 text-[13px] text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-200 transition-colors"
                  placeholder="Smith"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus={mode === "sign-in"}
              className="w-full h-10 px-3 rounded-lg bg-gray-50 border border-gray-200 text-[13px] text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-200 transition-colors"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full h-10 px-3 rounded-lg bg-gray-50 border border-gray-200 text-[13px] text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-200 transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-[12px] text-red-500 font-medium">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full h-10 rounded-lg bg-gray-900 text-white text-[13px] font-semibold tracking-tight hover:bg-gray-800 active:bg-black disabled:opacity-50 transition-colors"
          >
            {busy
              ? "..."
              : mode === "sign-in"
              ? "Sign in"
              : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
