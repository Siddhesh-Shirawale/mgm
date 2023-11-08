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
const fs = __importStar(require("fs"));
const amqplib_1 = __importDefault(require("amqplib"));
const cluster_1 = __importDefault(require("cluster"));
const os_1 = __importDefault(require("os"));
const util_1 = __importDefault(require("util"));
const cors_1 = __importDefault(require("cors"));
const readFileAsync = util_1.default.promisify(fs.readFile); // Promisify the fs.readFile method
const PORT = 8080;
const productDataFile = "products.json";
let wssMap = new Map();
// console.log("line 21", wssMap.size);
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
            // console.log("rabbit mq server started", connection);
            return connection;
        });
    }
    function setupWebSocketServer() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const server = http.createServer((req, res) => {
                (0, cors_1.default)()(req, res, () => {
                    res.writeHead(200, {
                        "Content-Type": "text/plain",
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE",
                        "Access-Control-Allow-Headers": "Content-Type",
                    });
                    res.end("WebSocket server is running");
                });
            });
            const wss = new ws_1.default.Server({
                server,
                maxPayload: 1024 * 1024,
                perMessageDeflate: false,
                clientTracking: true,
            });
            wssMap.set(Number((_a = cluster_1.default === null || cluster_1.default === void 0 ? void 0 : cluster_1.default["worker"]) === null || _a === void 0 ? void 0 : _a["id"]), wss);
            // console.log(`Client added to worker: ${cluster?.["worker"]?.["id"]}`);
            wss.on("connection", (ws) => {
                var _a;
                console.log("Client connected to Worker: " + ((_a = cluster_1.default === null || cluster_1.default === void 0 ? void 0 : cluster_1.default.worker) === null || _a === void 0 ? void 0 : _a.id));
                ws.on("message", (message) => __awaiter(this, void 0, void 0, function* () {
                    console.log("Message received");
                    if (typeof message === "string") {
                        console.log("messageTypeString", message);
                        let action = JSON.parse(message);
                        console.log("61", message);
                        if ((action === null || action === void 0 ? void 0 : action["action"]) === "read") {
                            const products = yield readProductsAsync();
                            const productsToSend = products.slice(0, 5);
                            ws.send(JSON.stringify({ products: productsToSend }));
                        }
                        else if ((action === null || action === void 0 ? void 0 : action["action"]) === "detail") {
                            const products = yield readProductsAsync();
                            const product = products.find((p) => p.id === Number(action === null || action === void 0 ? void 0 : action["productId"]));
                            ws.send(JSON.stringify({ product: product, action: "detail" }));
                        }
                        else {
                            const connection = yield createRabbitMQConnection();
                            const channel = yield connection.createChannel();
                            const queue = "websocket_queue";
                            yield channel.assertQueue(queue, { durable: false });
                            channel.sendToQueue(queue, Buffer.from(message));
                            consumeQueue();
                            // Close RabbitMQ connection
                            // await channel.close();
                            // await connection.close();
                        }
                    }
                    else if (message instanceof Buffer) {
                        let msg = JSON.parse(message.toString());
                        console.log("102", JSON.parse(message.toString()));
                        if ((msg === null || msg === void 0 ? void 0 : msg["action"]) === "read") {
                            const products = yield readProductsAsync();
                            const productsToSend = products.slice(0, 5);
                            ws.send(JSON.stringify({ products: productsToSend }));
                        }
                        else if ((msg === null || msg === void 0 ? void 0 : msg["action"]) === "detail") {
                            const products = yield readProductsAsync();
                            const product = products.find((p) => p.id === Number(msg === null || msg === void 0 ? void 0 : msg["productId"]));
                            ws.send(JSON.stringify({ product: product, action: "detail" }));
                        }
                        else {
                            const connection = yield createRabbitMQConnection();
                            const channel = yield connection.createChannel();
                            const queue = "websocket_queue";
                            yield channel.assertQueue(queue, { durable: false });
                            channel.sendToQueue(queue, Buffer.from(message));
                            consumeQueue();
                            // await channel.close();
                            // await connection.close();
                        }
                    }
                    else {
                        console.error("Received an unsupported message type:", typeof message);
                    }
                }));
                ws.on("close", (code, reason) => {
                    console.log("Client disconnected with code:", code, "and reason:", reason.toString());
                });
            });
            yield new Promise((resolve) => {
                server.listen(PORT, () => {
                    var _a;
                    console.log(`WebSocket server is running on port ${PORT} ${(_a = cluster_1.default.worker) === null || _a === void 0 ? void 0 : _a["id"]}`);
                    resolve();
                });
            });
        });
    }
    function main() {
        return __awaiter(this, void 0, void 0, function* () {
            yield setupWebSocketServer();
            consumeResponseQueue();
        });
    }
    main();
    function consumeQueue() {
        return __awaiter(this, void 0, void 0, function* () {
            // console.log("consume queue called");
            const connection = yield amqplib_1.default.connect("amqp://localhost");
            const channel = yield connection.createChannel();
            const queue = "websocket_queue";
            yield channel.assertQueue(queue, { durable: false });
            console.log("consumQueue called");
            channel.consume(queue, (msg) => __awaiter(this, void 0, void 0, function* () {
                if (msg !== null) {
                    let processResult;
                    console.log("consumeQueueMSG = ", JSON.parse(msg.content.toString()));
                    console.log("consumeQueWSSMAPSIZE", wssMap.size);
                    console.log("consumeQueWSSMAP", wssMap);
                    wssMap.forEach((wss, workerId) => {
                        console.log("consumeQueue wss", wss);
                        console.log("consumeQueue worker id", workerId);
                        wss.clients.forEach((client) => {
                            console.log("consumeQueue", client);
                            if (client.readyState === ws_1.default.OPEN && !processResult) {
                                console.log("client in ready state");
                                const message = JSON.parse(msg.content.toString());
                                processResult = handleMessage(client, message);
                            }
                        });
                    });
                    if (processResult) {
                        yield sendToResponseQueue(processResult);
                    }
                    channel.ack(msg);
                }
            }));
        });
    }
    function consumeResponseQueue() {
        return __awaiter(this, void 0, void 0, function* () {
            const connection = yield amqplib_1.default.connect("amqp://localhost");
            const channel = yield connection.createChannel();
            const queue = "response_queue";
            yield channel.assertQueue(queue, { durable: false });
            channel.consume(queue, (msg) => {
                if (msg !== null) {
                    const output = JSON.parse(msg.content.toString());
                    wssMap.forEach((wss, workerId) => {
                        console.log("consume response queue", wss);
                        console.log("consume response queue", workerId);
                        wss.clients.forEach((client) => {
                            console.log("consume response queue", client);
                            if (client.readyState === ws_1.default.OPEN) {
                                console.log("client in ready state in consumeResponseQueue");
                                client.send(JSON.stringify(output));
                                console.log("output sent to client", output);
                            }
                        });
                    });
                    channel.ack(msg);
                }
            });
        });
    }
    function sendToResponseQueue(processResult) {
        return __awaiter(this, void 0, void 0, function* () {
            const connection = yield amqplib_1.default.connect("amqp://localhost");
            const channel = yield connection.createChannel();
            const queue = "response_queue";
            yield channel.assertQueue(queue, { durable: false });
            channel.sendToQueue(queue, Buffer.from(JSON.stringify(processResult)));
            // await channel.close();
            // await connection.close();
        });
    }
    function handleMessage(ws, message) {
        console.log("Inside handleMessage, message:", message);
        console.log("229", message);
        console.log("203", message.action);
        console.log("204", message.productId);
        switch (message.action) {
            case "create":
                createProduct(message.product, (updatedProducts) => {
                    broadcastProducts(updatedProducts, message.action, message === null || message === void 0 ? void 0 : message["rowIndex"]);
                });
                break;
            case "read":
                readProducts((products) => {
                    const productsToSend = products.slice(0, 5);
                    ws.send(JSON.stringify({ products: productsToSend }));
                });
                console.log("read called");
                break;
            case "edit":
                editProduct(message.product, (updatedProducts) => {
                    console.log("handle message - edit called");
                    console.log("line 257", updatedProducts);
                    const existingProduct = updatedProducts.find((p) => p.id === message.product.id);
                    ws.send(JSON.stringify(existingProduct));
                    broadcastProducts(existingProduct, message.action, message.rowIndex);
                });
                break;
            case "detail":
                readProducts((products) => {
                    const product = products.find((p) => p.id === Number(message.productId));
                    ws.send(JSON.stringify({ action: "detail", products: product }));
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
            console.log("Inside readProducts, data read:", data);
            if (err) {
                console.error("Error reading products file:", err);
                callback([]);
            }
            else {
                try {
                    const products = JSON.parse(data);
                    console.log("Successfully parsed products");
                    callback((products === null || products === void 0 ? void 0 : products["products"]) || []);
                }
                catch (parseError) {
                    console.error("Error parsing products JSON:", parseError);
                    callback([]);
                }
            }
        });
    }
    function readProductsAsync() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const data = yield readFileAsync(productDataFile, "utf-8");
                // console.log("Inside readProducts, data read:", data);
                const products = JSON.parse(data);
                // console.log("Successfully parsed products");
                return (products === null || products === void 0 ? void 0 : products["products"]) || [];
            }
            catch (err) {
                // console.error("Error reading or parsing products file:", err);
                return [];
            }
        });
    }
    function editProduct(editedProduct, callback) {
        console.log("editProduct function called");
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
        console.log("Write product function called");
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
    function broadcastProducts(products, action, rowIndex) {
        console.log("broadcast product function called");
        wssMap.forEach((server, workerId) => {
            console.log(workerId);
            server.clients.forEach((client) => {
                console.log(client);
                if (client.readyState === ws_1.default.OPEN) {
                    client.send(JSON.stringify({
                        product: products,
                        action: action,
                        rowIndex: rowIndex,
                    }));
                }
            });
        });
    }
}
