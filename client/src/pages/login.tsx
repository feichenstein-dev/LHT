
export default function Login({ onSuccess }: { onSuccess?: () => void }) {
  const queryClient = useQueryClient();
  // Auto-refresh on tab focus/visibility and custom events
  useEffect(() => {
    if (!queryClient) return;
    const refresh = () => {
      queryClient.invalidateQueries && queryClient.invalidateQueries();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    window.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("lht-autorefresh", refresh);
    return () => {
      window.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("lht-autorefresh", refresh);
    };
  }, [queryClient]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // On mount, check for saved credentials
  useEffect(() => {
    const saved = localStorage.getItem("lht-remember-login");
    if (saved) {
      try {
        const creds = JSON.parse(saved);
        if (creds.email) setEmail(creds.email);
        if (creds.password) setPassword(creds.password);
        setRememberMe(true);
      } catch {}
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }
      if (rememberMe) {
        localStorage.setItem(
          "lht-remember-login",
          JSON.stringify({ email, password })
        );
      } else {
        localStorage.removeItem("lht-remember-login");
      }
      if (onSuccess) onSuccess();
    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <form onSubmit={handleSubmit} action="/login" autoComplete="on" className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
  {/* Refresh button removed: no full reload, rely on state/query refresh */}
        <h2 className="text-2xl font-bold mb-6 text-center">Login</h2>
        <div className="mb-4">
          <label className="block mb-1 font-medium">Email</label>
          <input
            type="email"
            name="username"
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring focus:border-blue-300"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="username"
            inputMode="email"
          />
        </div>
        <div className="mb-4">
          <label className="block mb-1 font-medium">Password</label>
          <input
            type="password"
            name="password"
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring focus:border-blue-300"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <div className="mb-4 flex items-center">
          <input
            id="rememberMe"
            type="checkbox"
            checked={rememberMe}
            onChange={e => setRememberMe(e.target.checked)}
            className="mr-2"
          />
          <label htmlFor="rememberMe" className="text-sm">Remember Me</label>
        </div>
        {error && <div className="mb-4 text-red-500 text-sm">{error}</div>}
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
          disabled={loading}
        >
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
}
import React, { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
