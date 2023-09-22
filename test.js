const WebSocket = require("ws");

// Define the WebSocket URL with the desired namespace
const wsUrl = "ws://localhost:8080/message";

// Define the message object
const message = {
  action: "read",
};

const ws = new WebSocket(wsUrl);

ws.on("open", () => {
  // Send the message as a JSON string
  ws.send(JSON.stringify(message));
});

ws.on("message", (data) => {
  // Handle the response from the server
  console.log("Received:", data);
  // You can add additional handling logic here
  ws.close();
});

ws.on("close", () => {
  console.log("WebSocket connection closed");
});
