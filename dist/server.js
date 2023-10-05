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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const http = __importStar(require("http"));
// import cluster from "cluster";
const fs = __importStar(require("fs"));
const amqplib_1 = __importDefault(require("amqplib"));
const productDataFile = "products.json";
// if (cluster.isPrimary) {
//   // Fork worker processes for each CPU core
//   for (let i = 0; i < numCPUs; i++) {
//     cluster.fork();
//   }
//   cluster.on("exit", (worker, code, signal) => {
//     console.log(`Worker ${worker.process.pid} died`);
//   });
// } else {
const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("WebSocket server is running");
});
// const workerId = cluster.worker!.id; // Get the worker ID
// const port = 8080 + workerId; // Calculate the port based on the worker ID
const wss = new ws_1.default.Server({
    server,
    maxPayload: 1024 * 1024,
    perMessageDeflate: false,
    clientTracking: true,
    // noServer: true,
});
wss.on("connection", (ws) => {
    // console.log(`WebSocket client connected on worker ${cluster.worker!.id}`);
    console.log("connected to server");
    // ws.send("connected to ws");
    ws.on("message", (message) => __awaiter(void 0, void 0, void 0, function* () {
        if (typeof message === "string") {
            // Ensure 'message' is a string
            // console.log(message);
            const connection = yield amqplib_1.default.connect("amqp://localhost");
            const channel = yield connection.createChannel();
            // Declare a queue
            const queue = "websocket_queue";
            yield channel.assertQueue(queue, { durable: false });
            // Send the message to RabbitMQ
            channel.sendToQueue(queue, Buffer.from(message));
            // Close RabbitMQ connection
            yield channel.close();
            yield connection.close();
        }
        else if (message instanceof Buffer) {
            // Convert 'message' Buffer to a string
            // console.log(JSON.parse(message.toString()));
            // handleMessage(ws, JSON.parse(message.toString()));
            const connection = yield amqplib_1.default.connect("amqp://localhost");
            const channel = yield connection.createChannel();
            // Declare a queue
            const queue = "websocket_queue";
            yield channel.assertQueue(queue, { durable: false });
            // Send the message to RabbitMQ
            channel.sendToQueue(queue, Buffer.from(message));
            // Close RabbitMQ connection
            yield channel.close();
            yield connection.close();
        }
        else {
            // console.error("Received an unsupported message type:", typeof message);
        }
    }));
    ws.on("close", () => {
        // console.log(
        //   `WebSocket client disconnected on worker ${cluster.worker!.id}`
        // );
    });
});
server.listen(8080, () => {
    console.log(`WebSocket server is running on port 8080`);
});
function consumeQueue() {
    return __awaiter(this, void 0, void 0, function* () {
        const connection = yield amqplib_1.default.connect("amqp://localhost");
        const channel = yield connection.createChannel();
        const queue = "websocket_queue";
        yield channel.assertQueue(queue, { durable: false });
        channel.consume(queue, (msg) => {
            console.log("96", msg);
            if (msg !== null) {
                wss.clients.forEach((client) => {
                    if (client.readyState === ws_1.default.OPEN) {
                        // client.send(msg.content.toString());
                        handleMessage(client, JSON.parse(msg.content.toString()));
                    }
                });
                // Acknowledge the message
                channel.ack(msg);
            }
        });
    });
}
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
                const existingProduct = updatedProducts.find((p) => p.id === message.product.id);
                ws.send(JSON.stringify(existingProduct));
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
            console.error("Error reading products file:", err);
            callback([]);
        }
        else {
            try {
                const products = JSON.parse(data);
                callback((products === null || products === void 0 ? void 0 : products["products"]) || []);
            }
            catch (parseError) {
                console.error("Error parsing products JSON:", parseError);
                callback([]);
            }
        }
    });
}
function editProduct(editedProduct, callback) {
    readProducts((products) => {
        const existingProduct = products.find((p) => p.id === editedProduct.id);
        if (existingProduct) {
            // Merge the existing product data with the new data
            const updatedProduct = Object.assign(Object.assign({}, existingProduct), editedProduct);
            // Find the index of the existing product
            const existingProductIndex = products.indexOf(existingProduct);
            // Replace the existing product with the updated product in the array
            products[existingProductIndex] = updatedProduct;
            writeProducts(products, () => {
                callback(products);
            });
        }
    });
}
function writeProducts(products, callback) {
    let updatedProducts = { products: products };
    fs.writeFile(productDataFile, JSON.stringify(updatedProducts, null, 2), "utf-8", (err) => {
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
        if (client !== sender && client.readyState === ws_1.default.OPEN) {
            client.send(JSON.stringify(products));
        }
    });
}
// }
consumeQueue();