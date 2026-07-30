import { useEffect, useState } from "react";

type ConnectionState = "checking" | "connected" | "unreachable";

const FALLBACK_BACKEND_URL = "http://127.0.0.1:4317";

export function App(): JSX.Element {
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const backendUrl = window.sentinel?.getBackendUrl() ?? FALLBACK_BACKEND_URL;

  useEffect(() => {
    let cancelled = false;

    async function checkHealth(): Promise<void> {
      try {
        const response = await fetch(`${backendUrl}/health`);
        if (!cancelled) {
          setConnection(response.ok ? "connected" : "unreachable");
        }
      } catch {
        if (!cancelled) {
          setConnection("unreachable");
        }
      }
    }

    void checkHealth();
    const interval = setInterval(() => void checkHealth(), 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [backendUrl]);

  return (
    <main>
      <h1>Sentinel</h1>
      <p>
        Backend ({backendUrl}): <strong>{connection}</strong>
      </p>
    </main>
  );
}
