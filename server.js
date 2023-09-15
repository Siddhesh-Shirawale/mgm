const WebSocket = require("ws");
const http = require("http");
const cluster = require("cluster");
const numCPUs = require("os").cpus().length;

if (cluster.isMaster) {
  // Fork worker processes for each CPU core
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
  });
} else {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("WebSocket server is running");
  });

  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws) => {
    // Handle a new WebSocket connection
    console.log(`Client connected on worker ${cluster.worker.id}`);

    ws.on("message", (message) => {
      // Handle incoming messages from clients
      console.log(`Received: ${message}`);
      // Broadcast the message to all connected clients
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    });

    ws.on("close", () => {
      // Handle client disconnect
      console.log(`Client disconnected on worker ${cluster.worker.id}`);
    });
  });

  const port = process.env.PORT || 8080;
  server.listen(port, () => {
    console.log(
      `WebSocket server is running on worker ${cluster.worker.id}, port ${port}`
    );
  });
}
