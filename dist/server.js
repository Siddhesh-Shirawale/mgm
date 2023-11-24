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
const cluster_1 = __importDefault(require("cluster"));
const os_1 = __importDefault(require("os"));
const util_1 = __importDefault(require("util"));
const cors_1 = __importDefault(require("cors"));
const readFileAsync = util_1.default.promisify(fs.readFile); // Promisify the fs.readFile method
const PORT = 8081;
const rabbitmq_1 = require("./rabbitmq");
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
const rabbitMqUrl = "amqp://localhost";
const queue = "editqueue";
if (cluster_1.default.isPrimary) {
    const workerSockets = [];
    // Fork workers
    const numCPUs = os_1.default.cpus().length;
    for (let i = 0; i < numCPUs; i++) {
        const worker = cluster_1.default.fork();
        workerSockets.push(worker);
    }
    cluster_1.default.on("exit", (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
    });
    // cluster.on("message", (worker, message) => {
    //   console.log(workerSockets.length);
    //   console.log("63", typeof message);
    //   console.log("66", typeof message.type);
    //   if (message.type === "productUpdate") {
    //     // Broadcast the updated product to all connected WebSocket clients in all workers
    //     workerSockets?.forEach(async (workerSocket: any) => {
    //       let connection = await connectToRabbitMQ();
    //       const channel = await connection.createChannel();
    //       await channel.assertQueue(queue);
    //       console.log(
    //         "message received in master - ",
    //         message.type,
    //         message.product.toString()
    //       );
    //       channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)));
    //       // console.log(`message received in master process - ${message.product}`);
    //       // workerSocket.send({ type: "productUpdate", product: message.product });
    //     });
    //   }
    // });
}
else {
    const wss = new ws_1.default.Server({
        server,
        maxPayload: 1024 * 1024,
        perMessageDeflate: false,
        clientTracking: true,
    });
    // wss.setMaxListeners(1000);
    // async function connectToRabbitMQ() {
    //   try {
    //     const connection = await amqp.connect(rabbitMqUrl);
    //     return connection;
    //   } catch (error) {
    //     console.error("Error creating RabbitMQ channel:", error);
    //     throw error;
    //   }
    // }
    wss.on("connection", (ws) => __awaiter(void 0, void 0, void 0, function* () {
        // let connection = await connectToRabbitMQ();
        // const channel = await connection.createChannel();
        // await channel.assertQueue(queue);
        ws.on("message", (message) => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            try {
                if (message instanceof Buffer) {
                    let msg = JSON.parse(message === null || message === void 0 ? void 0 : message.toString());
                    console.log(`client connected on worker - ${(_a = cluster_1.default.worker) === null || _a === void 0 ? void 0 : _a["id"]}`);
                    console.log("main action", msg === null || msg === void 0 ? void 0 : msg.action);
                    if ((msg === null || msg === void 0 ? void 0 : msg["action"]) === "read") {
                        const products = yield readProductsAsync();
                        const productsToSend = products.slice(0, 5);
                        ws.send(JSON.stringify({ products: productsToSend }));
                    }
                    else if ((msg === null || msg === void 0 ? void 0 : msg["action"]) === "detail") {
                        console.log("detail called");
                        const products = yield readProductsAsync();
                        const product = products.find((p) => p.id === Number(msg === null || msg === void 0 ? void 0 : msg["productId"]));
                        ws.send(JSON.stringify({ product: product, action: "detail" }));
                    }
                    else if ((msg === null || msg === void 0 ? void 0 : msg["action"]) === "edit") {
                        (() => __awaiter(void 0, void 0, void 0, function* () {
                            const { connection, channel } = yield (0, rabbitmq_1.connect)();
                            // Define your worker logic here
                            // Example: Send a message to a queue
                            const queueName = "editqueue";
                            yield channel.assertQueue(queueName);
                            console.log("Send to queue called");
                            channel.sendToQueue(queueName, Buffer.from(message));
                            process.on("beforeExit", () => {
                                connection.close();
                            });
                        }))();
                        // console.log(msg.action);
                        // console.log(msg);
                        // channel?.sendToQueue(queue, Buffer.from(message));
                        // console.log(typeof message);
                        // if (process.send) {
                        //   process.send({
                        //     type: "productUpdate",
                        //     product: message,
                        //   });
                        // }
                        // handleMessage(ws, JSON.parse(message?.toString()));
                    }
                    else {
                        // if (channel) {
                        //   channel?.sendToQueue(queue, Buffer.from(message));
                        // } else {
                        //   console.error("RabbitMQ channel is undefined.");
                        // }
                    }
                }
            }
            catch (error) {
                console.log(error);
                console.error("Error parsing incoming message: Invalid message format");
            }
        }));
        (() => __awaiter(void 0, void 0, void 0, function* () {
            var _b;
            const { connection, channel } = yield (0, rabbitmq_1.connect)();
            // Define your worker logic here
            // Example: Consume messages from a queue
            const queueName = "editqueue";
            yield channel.assertQueue(queueName);
            console.log(`Worker ${(_b = cluster_1.default === null || cluster_1.default === void 0 ? void 0 : cluster_1.default["worker"]) === null || _b === void 0 ? void 0 : _b["id"]} is waiting for messages...`);
            channel.consume(queueName, (msg) => {
                var _a;
                console.log("Consume queue called");
                if (msg !== null) {
                    console.log(`Worker ${(_a = cluster_1.default === null || cluster_1.default === void 0 ? void 0 : cluster_1.default["worker"]) === null || _a === void 0 ? void 0 : _a["id"]} received message: ${msg.content.toString()}`);
                    wss === null || wss === void 0 ? void 0 : wss.clients.forEach((client) => {
                        var _a;
                        console.log("client present");
                        try {
                            let message = JSON.parse((_a = msg === null || msg === void 0 ? void 0 : msg["content"]) === null || _a === void 0 ? void 0 : _a.toString());
                            // console.log(msg);
                            if ((message === null || message === void 0 ? void 0 : message["action"]) === "edit") {
                                handleMessage(client, JSON.parse(msg === null || msg === void 0 ? void 0 : msg.content.toString()));
                            }
                            else {
                                console.log("consume queue action - ", message === null || message === void 0 ? void 0 : message["action"]);
                            }
                        }
                        catch (error) {
                            console.log("error parsing in consume");
                        }
                    });
                    // Process the message as needed
                    channel.ack(msg);
                    // Acknowledge the message to remove it from the queue
                }
            });
            // channel.assertQueue("", { exclusive: true }, (err, q) => {
            //   channel.bindQueue(q.queue, exchange, "");
            //   channel.consume(
            //     q.queue,
            //     (msg) => {
            //       wss.clients.forEach((client) => {
            //         if (client.readyState === WebSocket.OPEN) {
            //           client.send(msg.content.toString());
            //         }
            //       });
            //     },
            //     { noAck: true }
            //   );
            // });
            process.on("beforeExit", () => {
                connection.close();
            });
        }))();
        ws.on("close", () => {
            // clearInterval(heartbeatInterval);
            // console.log("client disconnected");
            // reconnect();
        });
        ws.on("disconnect", () => {
            console.log(`Client disconnected: ${ws === null || ws === void 0 ? void 0 : ws["id"]}`);
            wss.clients.delete(ws === null || ws === void 0 ? void 0 : ws["id"]); // Remove disconnected client from the list
        });
    }));
    server.listen(PORT, () => {
        var _a;
        console.log(`WebSocket server is running on port ${PORT} ${(_a = cluster_1.default.worker) === null || _a === void 0 ? void 0 : _a["id"]}`);
    });
    function handleMessage(ws, message) {
        console.log("Handle message called");
        switch (message.action) {
            case "read":
                readProducts((products) => {
                    const productsToSend = products.slice(0, 5);
                    ws.send(JSON.stringify({ products: productsToSend }));
                });
                break;
            case "edit":
                editProduct(message.product, (updatedProducts) => {
                    const existingProduct = updatedProducts.find((p) => p.id === message.product.id);
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
        console.log(wss === null || wss === void 0 ? void 0 : wss.clients.size);
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
