import { useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage } from "@sentinel/shared";

export type SocketConnectionState = "connecting" | "connected" | "disconnected";

const RECONNECT_DELAY_MS = 2000;

/** One WebSocket connection to the backend, auto-reconnecting on close. Callers pass
 * a message handler (kept in a ref so identity changes don't reopen the socket) and
 * get back the connection state plus a send() for run:prompt-response. */
export function useBackendSocket(
  wsUrl: string,
  onMessage: (message: ServerMessage) => void,
): { connectionState: SocketConnectionState; send: (message: ClientMessage) => void } {
  const [connectionState, setConnectionState] = useState<SocketConnectionState>("connecting");
  const socketRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    function connect(): void {
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;
      setConnectionState("connecting");

      socket.onopen = () => {
        if (!cancelled) setConnectionState("connected");
      };
      socket.onclose = () => {
        if (cancelled) return;
        setConnectionState("disconnected");
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
      socket.onerror = () => socket.close();
      socket.onmessage = (event: MessageEvent<string>) => {
        try {
          const parsed = JSON.parse(event.data) as ServerMessage;
          onMessageRef.current(parsed);
        } catch {
          // Malformed frame — ignore rather than crash the renderer.
        }
      };
    }

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current?.close();
    };
  }, [wsUrl]);

  function send(message: ClientMessage): void {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  }

  return { connectionState, send };
}
