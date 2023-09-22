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
const fs = __importStar(require("fs"));
const numCPUs = require("os").cpus().length;
const productDataFile = "products.json";
if (cluster_1.default.isPrimary) {
    // Fork worker processes for each CPU core
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
        console.log(`WebSocket client connected on worker ${cluster_1.default.worker.id}`);
        ws.on("message", (message) => {
            if (typeof message === "string") {
                // Ensure 'message' is a string
                console.log(message);
                handleMessage(ws, JSON.parse(message));
            }
            else if (message instanceof Buffer) {
                // Convert 'message' Buffer to a string
                console.log(JSON.parse(message.toString()));
                handleMessage(ws, JSON.parse(message.toString()));
            }
            else {
                console.error("Received an unsupported message type:", typeof message);
            }
        });
        ws.on("close", () => {
            console.log(`WebSocket client disconnected on worker ${cluster_1.default.worker.id}`);
        });
    });
    server.listen(8080, () => {
        console.log(`WebSocket server is running on worker ${cluster_1.default.worker.id}, port 8080`);
    });
    function handleMessage(ws, message) {
        switch (message.action) {
            case "create":
                createProduct(message.product, (updatedProducts) => {
                    broadcastProducts(ws, updatedProducts);
                });
                break;
            case "read":
                readProducts((products) => {
                    ws.send(JSON.stringify(products));
                });
                break;
            case "edit":
                editProduct(message.product, (updatedProducts) => {
                    broadcastProducts(ws, updatedProducts);
                });
                break;
            default:
                // Handle unsupported actions or errors
                break;
        }
    }
    function createProduct(newProduct, callback) {
        readProducts((products) => {
            newProduct.id = Date.now(); // Generate a unique ID (timestamp-based)
            products.push(newProduct);
            writeProducts(products, () => {
                callback(products);
            });
        });
    }
    function readProducts(callback) {
        fs.readFile(productDataFile, "utf-8", (err, data) => {
            if (err) {
                callback([]);
            }
            else {
                const products = JSON.parse(data);
                console.log(products);
                callback(products);
            }
        });
    }
    function editProduct(editedProduct, callback) {
        readProducts((products) => {
            const existingProductIndex = products.findIndex((p) => p.id === editedProduct.id);
            if (existingProductIndex !== -1) {
                products[existingProductIndex] = editedProduct;
                writeProducts(products, () => {
                    callback(products);
                });
            }
        });
    }
    function writeProducts(products, callback) {
        fs.writeFile(productDataFile, JSON.stringify(products, null, 2), "utf-8", (err) => {
            if (err) {
                console.error("Error writing the file:", err);
            }
            else {
                callback();
            }
        });
    }
    function broadcastProducts(sender, products) {
        wss.clients.forEach((client) => {
            if (client !== sender && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(products));
            }
        });
    }
}
