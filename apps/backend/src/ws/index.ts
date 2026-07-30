import type { RawData, WebSocket, WebSocketServer } from "ws";
import { isClientMessage, type ServerMessage } from "@sentinel/shared";
import type { WsPromptBroker } from "./promptBroker.js";

export function broadcast(wss: WebSocketServer, message: ServerMessage): void {
  const payload = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}

export function attachConnectionHandler(wss: WebSocketServer, promptBroker: WsPromptBroker): void {
  wss.on("connection", (socket: WebSocket) => {
    socket.on("message", (data: RawData) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        socket.send(
          JSON.stringify({ type: "error", message: "invalid JSON payload" } satisfies ServerMessage),
        );
        return;
      }

      if (!isClientMessage(parsed)) {
        socket.send(
          JSON.stringify({ type: "error", message: "unrecognized message shape" } satisfies ServerMessage),
        );
        return;
      }

      if (parsed.type === "ping") {
        socket.send(
          JSON.stringify({
            type: "pong",
            sentAt: parsed.sentAt,
            serverTime: new Date().toISOString(),
          } satisfies ServerMessage),
        );
        return;
      }

      if (parsed.type === "run:prompt-response") {
        promptBroker.respond(parsed.requestId, parsed.value);
      }
    });
  });
}
