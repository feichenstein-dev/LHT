import React, { useEffect, useState } from "react";

type Subscriber = {
  id: string;
  phone_number: string;
  status: string;
  joined_at: string;
};

export default function TestSubscribers() {
  // Auto-refresh on tab focus/visibility and custom events
  useEffect(() => {
    const refresh = () => {
      window.location.reload();
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
  }, []);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/subscribers")
      .then((res) => {
        if (!res.ok) throw new Error("API error: " + res.status);
        return res.json();
      })
      .then((data: Subscriber[]) => {
        setSubscribers(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div style={{ padding: 32 }}>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{ position: 'fixed', top: 16, right: 16, background: '#e5e7eb', color: '#374151', borderRadius: 9999, padding: '4px 12px', fontWeight: 600, fontSize: 12, boxShadow: '0 2px 6px rgba(0,0,0,0.07)', zIndex: 1000 }}
      >
        Refresh
      </button>
      <h1>Test: Subscribers API</h1>
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {subscribers.length === 0 && !loading && !error && <p>No subscribers found.</p>}
      {subscribers.length > 0 && (
        <ul>
          {subscribers.map((sub) => (
            <li key={sub.id}>
              {sub.phone_number} ({sub.status}) joined at {sub.joined_at}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
