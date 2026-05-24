// Socket.IO клиент (ПР16)
import { io } from "socket.io-client";

const SOCKET_URL =
  process.env.REACT_APP_SERVER_URL ||
  (typeof window !== "undefined" ? window.location.origin : "https://localhost:3000");

const socket = io(SOCKET_URL, {
  transports: ["websocket", "polling"],
});

socket.on("connect", () => {
  console.log("WebSocket: подключён, id:", socket.id);
});

socket.on("disconnect", () => {
  console.log("WebSocket: отключён");
});

export default socket;
