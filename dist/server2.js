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
const PORT = 8081;
const productDataFile = "products.json";
// console.log("line 21", wssMap.size);
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
    const wss = new ws_1.default.Server({
        server,
        maxPayload: 1024 * 1024,
        perMessageDeflate: false,
        clientTracking: true,
    });
    wss.setMaxListeners(1000);
    const rabbitMqUrl = "amqp://localhost";
    const queue = "editqueue";
    // console.log(channel);
    // Connect to RabbitMQ
    function connectToRabbitMQ() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const connection = yield amqplib_1.default.connect(rabbitMqUrl);
                return connection;
            }
            catch (error) {
                console.error("Error creating RabbitMQ channel:", error);
                throw error;
            }
        });
    }
    wss.on("connection", (ws) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b;
        console.log(`wss server running on worker ${(_a = cluster_1.default === null || cluster_1.default === void 0 ? void 0 : cluster_1.default.worker) === null || _a === void 0 ? void 0 : _a["id"]} `);
        // console.log(ws);
        // const heartbeatInterval = setInterval(() => {
        //   // Send a ping message to the client
        //   ws.ping();
        // }, 30000);
        (_b = connectToRabbitMQ()) === null || _b === void 0 ? void 0 : _b.then((connection) => __awaiter(void 0, void 0, void 0, function* () {
            console.log("Connected to RabbitMQ");
            let channel2 = yield connection.createChannel();
            yield channel2.assertQueue(queue);
            //// CONSUME
            channel2.consume(queue, (message) => {
                var _a;
                console.log(wss === null || wss === void 0 ? void 0 : wss.clients.size);
                let msg = (_a = message === null || message === void 0 ? void 0 : message.content) === null || _a === void 0 ? void 0 : _a.toString();
                // const workers: any = cluster.workers;
                process.on("message", (message) => {
                    console.log("message from worker", message);
                    if ((message === null || message === void 0 ? void 0 : message["type"]) === "update") {
                        console.log("IPC", message);
                        const data = message === null || message === void 0 ? void 0 : message.data;
                        console.log("IPC", data);
                        // Broadcast the message to all WebSocket clients in this worker
                        wss === null || wss === void 0 ? void 0 : wss.clients.forEach((client) => {
                            // console.log("client present");
                            var _a;
                            try {
                                let msg = JSON.parse((_a = message === null || message === void 0 ? void 0 : message.content) === null || _a === void 0 ? void 0 : _a.toString());
                                console.log(msg);
                                if ((msg === null || msg === void 0 ? void 0 : msg["action"]) === "edit") {
                                    handleMessage(client, JSON.parse(message.content.toString()));
                                }
                                else {
                                    console.log("consume queue action - ", msg === null || msg === void 0 ? void 0 : msg["action"]);
                                }
                            }
                            catch (error) {
                                console.log("error parsing in consume");
                            }
                        });
                    }
                });
                wss === null || wss === void 0 ? void 0 : wss.clients.forEach((client) => {
                    // console.log("client present");
                    var _a;
                    try {
                        let msg = JSON.parse((_a = message === null || message === void 0 ? void 0 : message.content) === null || _a === void 0 ? void 0 : _a.toString());
                        console.log(msg);
                        if ((msg === null || msg === void 0 ? void 0 : msg["action"]) === "edit") {
                            handleMessage(client, JSON.parse(message.content.toString()));
                        }
                        else {
                            console.log("consume queue action - ", msg === null || msg === void 0 ? void 0 : msg["action"]);
                        }
                    }
                    catch (error) {
                        console.log("error parsing in consume");
                    }
                });
            });
        }));
        let connection = yield connectToRabbitMQ();
        const channel = yield connection.createChannel();
        yield channel.assertQueue(queue);
        // When a WebSocket connection is established, forward messages to all workers
        // console.log("Client connected to Worker: " + cluster?.worker?.id);
        ws.on("message", (message) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                if (message instanceof Buffer) {
                    let msg = JSON.parse(message === null || message === void 0 ? void 0 : message.toString());
                    console.log("main action", msg === null || msg === void 0 ? void 0 : msg.action);
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
                    else if ((msg === null || msg === void 0 ? void 0 : msg["action"]) === "edit") {
                        // console.log(msg.action);
                        // console.log(msg);
                        const workers = cluster_1.default === null || cluster_1.default === void 0 ? void 0 : cluster_1.default["workers"];
                        Object.values(workers).forEach((worker) => {
                            var _a;
                            if ((worker === null || worker === void 0 ? void 0 : worker.id) !== ((_a = cluster_1.default === null || cluster_1.default === void 0 ? void 0 : cluster_1.default["worker"]) === null || _a === void 0 ? void 0 : _a["id"])) {
                                worker === null || worker === void 0 ? void 0 : worker.send(msg);
                            }
                        });
                        channel === null || channel === void 0 ? void 0 : channel.sendToQueue(queue, Buffer.from(message));
                    }
                    else {
                        // console.log("else called");
                        // channel.publish(exchangeName, "", Buffer.from(message));
                        // console.log(JSON.parse(message.toString()));
                        if (channel) {
                            channel === null || channel === void 0 ? void 0 : channel.sendToQueue(queue, Buffer.from(message));
                        }
                        else {
                            // const connection = await amqp.connect(rabbitMqUrl);
                            // channel = await connection.createChannel();
                            // await channel.assertQueue(queue);
                            // channel?.sendToQueue(queue, Buffer.from(message));
                            console.error("RabbitMQ channel is undefined.");
                        }
                        // setTimeout(() => {
                        //   channel.close();
                        //   // connection.close();
                        // }, 500);
                        // handleMessage(ws, JSON.parse(message?.toString()));
                    }
                }
            }
            catch (error) {
                console.log(error);
                console.error("Error parsing incoming message: Invalid message format");
            }
        }));
        ws.on("close", () => {
            // clearInterval(heartbeatInterval);
            // console.log("client disconnected");
            // reconnect();
        });
        ws.on("disconnect", () => {
            console.log(`Client disconnected: ${ws === null || ws === void 0 ? void 0 : ws["id"]}`);
            wss.clients.delete(ws === null || ws === void 0 ? void 0 : ws["id"]); // Remove disconnected client from the list
        });
        // ws.on("pong", () => {
        //   console.log("Received pong from client");
        // });
        // Listen for messages from RabbitMQ and send them to the WebSocket clients
        // connectToRabbitMQ()?.then(async (connection) => {
        //   console.log("Connected to RabbitMQ");
        //   let channel2 = await connection.createChannel();
        //   await channel2.assertQueue(queue, { durable: true });
        //   channel2.consume(queue, (message: any) => {
        //     // Handle RabbitMQ messages here and broadcast to connected clients
        //     // console.log("consume queue called");
        //     // console.log(message);
        //     console.log(wss?.clients.size);
        //     // console.log(wss);
        //     wss?.clients.forEach((client) => {
        //       console.log("client present");
        //       try {
        //         let msg = JSON.parse(message?.content?.toString());
        //         console.log(msg);
        //         if (msg?.["action"] === "edit") {
        //           handleMessage(client, JSON.parse(message.content.toString()));
        //         } else {
        //           console.log("consume queue action - ", msg?.["action"]);
        //         }
        //       } catch (error) {
        //         console.log("error parsing in consume");
        //       }
        //     });
        //   });
        // });
    }));
    // connectToWebSocketServer();
    server.listen(PORT, () => {
        var _a;
        console.log(`WebSocket server is running on port ${PORT} ${(_a = cluster_1.default.worker) === null || _a === void 0 ? void 0 : _a["id"]}`);
    });
    // if (!sticky.listen(server, PORT)) {
    //   // This is the master process
    //   server.once("listening", () => {
    //     `WebSocket server is running on port ${PORT} ${cluster.worker?.["id"]}`;
    //   });
    // } else {
    //   // This is a worker process, so it will handle the WebSocket connections
    //   server.on("upgrade", (request, socket, head) => {
    //     wss.handleUpgrade(request, socket, head, (ws) => {
    //       wss.emit("connection", ws, request);
    //     });
    //   });
    // }
    function handleMessage(ws, message) {
        console.log("Handle message called");
        switch (message.action) {
            // case "create":
            //   createProduct(message.product, (updatedProducts) => {
            //     broadcastProducts(
            //       updatedProducts,
            //       message.action,
            //       message?.["rowIndex"]
            //     );
            //   });
            //   break;
            case "read":
                readProducts((products) => {
                    const productsToSend = products.slice(0, 5);
                    ws.send(JSON.stringify({ products: productsToSend }));
                });
                // console.log("read called");
                break;
            case "edit":
                // console.log("handleMessage edit called");
                editProduct(message.product, (updatedProducts) => {
                    const existingProduct = updatedProducts.find((p) => p.id === message.product.id);
                    // ws.send(
                    //   JSON.stringify({
                    //     product: existingProduct,
                    //     action: message.action,
                    //     rowIndex: message.rowIndex,
                    //   })
                    // );
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
        // console.log("readProducts called");
        fs.readFile(productDataFile, "utf-8", (err, data) => {
            if (err) {
                console.error("Error reading products file:", err);
                callback([]);
            }
            else {
                try {
                    const products = JSON.parse(data);
                    // console.log("Successfully parsed products");
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
                // console.log("readProductsAsync called");
                const products = JSON.parse(data);
                return (products === null || products === void 0 ? void 0 : products["products"]) || [];
            }
            catch (err) {
                console.error("Error reading or parsing products file:", err);
                return [];
            }
        });
    }
    function editProduct(editedProduct, callback) {
        // console.log("editProduct function called");
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
        // console.log("Write product function called");
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
        wss.clients.forEach((client) => {
            if (client.readyState === ws_1.default.OPEN) {
                client.send(JSON.stringify({
                    product: products,
                    action: action,
                    rowIndex: rowIndex,
                }));
            }
        });
    }
}
