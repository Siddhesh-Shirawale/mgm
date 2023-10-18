const autocannon = require("autocannon");

const config = {
  url: "ws://localhost:8080",
  connections: 1000,
  duration: 10,
  title: "WebSocket Load Test",

  setupClient: (client) => {
    const message = JSON.stringify({ action: "read" });
    client.on("upgrade", (req, socket) => {
      socket.write(message);
    });
  },
};

autocannon(config);
