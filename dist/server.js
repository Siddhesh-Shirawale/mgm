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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const http = __importStar(require("http"));
const fs = __importStar(require("fs"));
const amqplib_1 = __importDefault(require("amqplib"));
const cluster_1 = __importDefault(require("cluster"));
const os_1 = __importDefault(require("os"));
const productDataFile = "products.json";
const wssMap = new Map();
if (cluster_1.default.isPrimary) {
    const numCPUs = os_1.default.cpus().length;
    for (let i = 0; i < numCPUs; i++) {
        cluster_1.default.fork();
    }
    cluster_1.default.on("exit", (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
    });
}
else {
    function createRabbitMQConnection() {
        return __awaiter(this, void 0, void 0, function* () {
            const connection = yield amqplib_1.default.connect("amqp://localhost");
            return connection;
        });
    }
    const server = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("WebSocket server is running");
    });
    const wss = new ws_1.default.Server({
        server,
        maxPayload: 1024 * 1024,
        perMessageDeflate: false,
        clientTracking: true,
    });
    wssMap.set(Number((_a = cluster_1.default === null || cluster_1.default === void 0 ? void 0 : cluster_1.default["worker"]) === null || _a === void 0 ? void 0 : _a["id"]), wss);
    wss.on("connection", (ws) => {
        console.log("connected to server");
        ws.on("message", (message) => __awaiter(void 0, void 0, void 0, function* () {
            if (typeof message === "string") {
                const connection = yield createRabbitMQConnection();
                const channel = yield connection.createChannel();
                // Declare a queue
                const queue = "websocket_queue";
                yield channel.assertQueue(queue, { durable: false });
                channel.sendToQueue(queue, Buffer.from(message));
                // Close RabbitMQ connection
                yield channel.close();
                yield connection.close();
            }
            else if (message instanceof Buffer) {
                const connection = yield createRabbitMQConnection();
                const channel = yield connection.createChannel();
                const queue = "websocket_queue";
                yield channel.assertQueue(queue, { durable: false });
                channel.sendToQueue(queue, Buffer.from(message));
                yield channel.close();
                yield connection.close();
            }
            else {
                console.error("Received an unsupported message type:", typeof message);
            }
        }));
        ws.on("close", () => { });
    });
    consumeQueue();
    server.listen(8080, () => {
        var _a;
        console.log(`WebSocket server is running on port 8080 ${(_a = cluster_1.default.worker) === null || _a === void 0 ? void 0 : _a["id"]}`);
    });
    // When a message is received from RabbitMQ, call this function
    // Consume messages from RabbitMQ
    // async function consumeQueue() {
    //   const connection = await amqp.connect("amqp://localhost");
    //   const channel = await connection.createChannel();
    //   const queue = "websocket_queue";
    //   await channel.assertQueue(queue, { durable: false });
    //   channel.consume(queue, (msg) => {
    //     if (msg !== null) {
    //       handleMessageFromQueue(JSON.parse(msg.content.toString()));
    //       channel.ack(msg);
    //     }
    //   });
    // }
    function consumeQueue() {
        return __awaiter(this, void 0, void 0, function* () {
            const connection = yield amqplib_1.default.connect("amqp://localhost");
            const channel = yield connection.createChannel();
            const queue = "websocket_queue";
            yield channel.assertQueue(queue, { durable: false });
            channel.consume(queue, (msg) => {
                if (msg !== null) {
                    wss.clients.forEach((client) => {
                        console.log(client);
                        if (client.readyState === ws_1.default.OPEN) {
                            handleMessage(client, JSON.parse(msg.content.toString()));
                        }
                    });
                    channel.ack(msg);
                }
            });
        });
    }
    function handleMessage(ws, message) {
        console.log(ws);
        switch (message.action) {
            case "create":
                createProduct(message.product, (updatedProducts) => {
                    broadcastProducts(updatedProducts);
                });
                break;
            case "read":
                readProducts((products) => {
                    const productsToSend = products.slice(0, 10);
                    ws.send(JSON.stringify(productsToSend));
                });
                console.log("read called");
                break;
            case "edit":
                editProduct(message.product, (updatedProducts) => {
                    const existingProduct = updatedProducts.find((p) => p.id === message.product.id);
                    ws.send(JSON.stringify(existingProduct));
                    broadcastProducts(updatedProducts);
                });
                break;
            default:
                break;
        }
    }
    function createProduct(newProduct, callback) {
        readProducts((products) => {
            newProduct.id = Date.now();
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
                    console.log("Products from file:", products);
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
                const updatedProduct = Object.assign(Object.assign({}, existingProduct), editedProduct);
                const existingProductIndex = products.indexOf(existingProduct);
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
    function broadcastProducts(products) {
        wssMap.forEach((wss, workerId) => {
            wss.clients.forEach((client) => {
                if (client.readyState === ws_1.default.OPEN) {
                    client.send(JSON.stringify(products));
                }
            });
        });
    }
}
