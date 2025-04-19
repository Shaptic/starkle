import $ from "jquery";
import { io, Socket } from "socket.io-client";
import { WS_ADDR } from "./contracts/constants";

// Create a new WebSocket connection
export let socket: Socket = io(WS_ADDR ?? window.location.toString(), {
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 250,
  reconnectionDelayMax: 2000,
  // retries: 5,
  ackTimeout: 1000, // wait a bit before retrying
});

// Function to update status in the footer.
function updateStatus(
  status: "connected" | "reconnecting" | "disconnected",
  count?: number,
) {
  const footer = $("#connectionStatus");
  const text = $("#innerConnectionStatus");
  const clear = () =>
    footer
      .children(".status-icon")
      .attr("id", "")
      .removeClass()
      .addClass("status-icon");

  switch (status) {
    case "connected":
      clear().addClass(status);
      text.text("Connected to server.");
      break;

    case "disconnected":
      break;

    case "reconnecting":
      let t = "Reconnecting...";
      if ((count ?? 0) < 0) {
        t = "Reconnecting failed... click the icon to try again.";
        clear().addClass("disconnected").attr("id", "reconnectBtn");
        // Bind a click event to manually reconnect.
        $("#reconnectBtn").on("click", () => {
          socket.connect();
        });
      } else {
        clear().addClass("connecting");
        if ((count ?? 0) > 1) {
          t += ` (attempt ${count}).`;
        }
      }
      text.text(t);

      break;

    default:
      console.error(`Unexpected server status: ${status}.`);
  }
}

// Bind Socket.IO events to update the connection status
socket.on("connect", () => {
  updateStatus("connected");
});

socket.on("disconnect", () => {
  updateStatus("disconnected");
});

socket.io.on("reconnect_attempt", (count) => {
  updateStatus("reconnecting", count);
});

socket.io.on("reconnect_failed", () => {
  updateStatus("reconnecting", -1);
});
