// const { WebSocket } = require("ws");

// // Number of connections to create
// const connections = 100;
// // Number of concurrent connections
// const concurrent = 10;
// // Test duration in seconds
// const duration = 60;

// const messages = [
//   "Hello, WebSocket Server!",
//   "Test message 2",
//   "Test message 3",
// ]; // Add more messages as needed

// function createWebSocketConnection() {
//   const ws = new WebSocket("ws://localhost:8000"); // Replace with your WebSocket server URL
//   let messageIndex = 0;

//   ws.on("open", () => {
//     console.log("Connected to WebSocket server");
//   });

//   ws.on("message", (data) => {
//     console.log(`Received: ${data}`);
//   });

//   ws.on("close", () => {
//     console.log("Connection closed");
//   });

//   // Send messages at a regular interval
//   const sendMessageInterval = setInterval(() => {
//     if (messageIndex < messages.length) {
//       ws.send(messages[messageIndex]);
//       messageIndex++;
//     } else {
//       clearInterval(sendMessageInterval);
//       ws.close();
//     }
//   }, 1000);
// }

// // Create multiple WebSocket connections
// for (let i = 0; i < connections; i++) {
//   createWebSocketConnection();
// }
