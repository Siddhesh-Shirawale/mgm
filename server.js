"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const WebSocket = __importStar(require("ws"));
const http = __importStar(require("http"));
const cluster_1 = __importDefault(require("cluster"));
const os = __importStar(require("os"));
const express_1 = __importDefault(require("express"));
// import productsRouter from "./app/routes/productRoutes";
const app = (0, express_1.default)();
app.use(express_1.default.json());
// app.use("/", productsRouter);
if (cluster_1.default.isPrimary) {
    // Fork worker processes for each CPU core
    const numCPUs = os.cpus().length;
    for (let i = 0; i < numCPUs; i++) {
        cluster_1.default.fork();
    }
    cluster_1.default.on("exit", (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
    });
}
else {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("WebSocket server is running");
    });
    const wss = new WebSocket.Server({ server });
    wss.on("connection", (ws) => {
        // Handle a new WebSocket connection
        console.log(`Client connected on worker ${cluster_1.default.worker.id}`);
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
            console.log(`Client disconnected on worker ${cluster_1.default.worker.id}`);
        });
    });
    const port = process.env.PORT || 8080;
    server.listen(port, () => {
        console.log(`WebSocket server is running on worker ${cluster_1.default.worker.id}, port ${port}`);
    });
}
