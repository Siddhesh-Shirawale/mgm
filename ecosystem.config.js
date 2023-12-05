const numCPUs = require("os").cpus().length;

module.exports = {
  apps: [
    {
      name: "websocket-server",
      script: "server.js", // Replace with your WebSocket server script filename
      instances: numCPUs, // Number of instances (workers) to create
      exec_mode: "cluster", // Enable clustering mode
      autorestart: true,
      watch: true,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 8081,
      },
    },
  ],
};
