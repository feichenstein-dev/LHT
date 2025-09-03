import React, { useEffect, useState } from "react";

type Subscriber = {
  id: string;
  phone_number: string;
  status: string;
  joined_at: string;
};

export default function TestSubscribers() {
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
