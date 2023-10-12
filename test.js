const WebSocket = require("ws");

// Define the WebSocket server URL
const serverUrl = "ws://localhost:8080"; // Replace with the correct WebSocket server URL

// Create a WebSocket client
const client = new WebSocket(serverUrl);

// Handle the WebSocket connection event
client.on("open", () => {
  // Send the "read" action when the connection is established
  client.send(JSON.stringify({ action: "read" }));
});

// Listen for messages from the server (optional)
client.on("message", (message) => {
  console.log("Received message from server:", message);
});

// Handle errors (optional)
client.on("error", (error) => {
  console.error("WebSocket error:", error);
});

// Handle the connection close event (optional)
client.on("close", (code, reason) => {
  console.log(`Connection closed with code ${code}: ${reason}`);
});
