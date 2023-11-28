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
// import * as _cluster from "cluster";
// const cluster = _cluster as unknown as _cluster.Cluster;
const os_1 = __importDefault(require("os"));
const util_1 = __importDefault(require("util"));
const cors_1 = __importDefault(require("cors"));
const readFileAsync = util_1.default.promisify(fs.readFile);
const PORT = 8081;
const rabbitmq_1 = require("./rabbitmq");
const productDataFile = "products.json";
process.setMaxListeners(20);
if (cluster_1.default.isPrimary) {
    // const workerSockets: any = [];
    // Fork workers
    const numCPUs = os_1.default.cpus().length;
    for (let i = 0; i < numCPUs; i++) {
        const worker = cluster_1.default.fork();
        // workerSockets.push(worker);
        worker.on("message", (message) => {
            console.log(`Message from worker ${worker.id}: ${message}`);
            // Forward the message to all other workers
            const workers = cluster_1.default.workers;
            Object.values(workers).forEach((otherWorker) => {
                if (otherWorker.id !== worker.id) {
                    otherWorker.send(message);
                }
            });
        });
    }
    cluster_1.default === null || cluster_1.default === void 0 ? void 0 : cluster_1.default.on("exit", (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
    });
}
else {
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
    wss.on("connection", (ws) => __awaiter(void 0, void 0, void 0, function* () {
        process.on("message", (message) => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b;
            console.log(`Message from master to worker ${(_a = cluster_1.default === null || cluster_1.default === void 0 ? void 0 : cluster_1.default["worker"]) === null || _a === void 0 ? void 0 : _a["id"]}: ${message}`);
            const { connection, channel } = yield (0, rabbitmq_1.connect)();
            const queueName = "editqueue";
            yield channel.assertQueue(queueName);
            // const msg = JSON.parse(message?.toString());
            if (process.send)
                process === null || process === void 0 ? void 0 : process.send("hello");
            console.log(`${(_b = cluster_1.default === null || cluster_1.default === void 0 ? void 0 : cluster_1.default["worker"]) === null || _b === void 0 ? void 0 : _b["id"]} - received message`);
            channel.sendToQueue(queueName, Buffer.from(message));
        }));
        ws.on("message", (message) => __awaiter(void 0, void 0, void 0, function* () {
            var _c;
            try {
                if (message instanceof Buffer) {
                    let msg = JSON.parse(message === null || message === void 0 ? void 0 : message.toString());
                    console.log(`client connected on worker - ${(_c = cluster_1.default.worker) === null || _c === void 0 ? void 0 : _c["id"]}`);
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
                            const queueName = "editqueue";
                            yield channel.assertQueue(queueName);
                            const msg = JSON.parse(message === null || message === void 0 ? void 0 : message.toString());
                            if (process.send)
                                process === null || process === void 0 ? void 0 : process.send(message);
                            console.log("Send to queue called");
                            channel.sendToQueue(queueName, Buffer.from(message));
                            process.on("beforeExit", () => {
                                connection.close();
                            });
                        }))();
                    }
                }
            }
            catch (error) {
                console.log(error);
                console.error("Error parsing incoming message: Invalid message format");
            }
        }));
        (() => __awaiter(void 0, void 0, void 0, function* () {
            var _d;
            const { connection, channel } = yield (0, rabbitmq_1.connect)();
            const queueName = "editqueue";
            yield channel.assertQueue(queueName);
            console.log(`Worker ${(_d = cluster_1.default === null || cluster_1.default === void 0 ? void 0 : cluster_1.default["worker"]) === null || _d === void 0 ? void 0 : _d["id"]} is waiting for messages...`);
            channel.consume(queueName, (msg) => {
                console.log("Consume queue called");
                if (msg !== null) {
                    wss === null || wss === void 0 ? void 0 : wss.clients.forEach((client) => {
                        var _a;
                        try {
                            let message = JSON.parse((_a = msg === null || msg === void 0 ? void 0 : msg["content"]) === null || _a === void 0 ? void 0 : _a.toString());
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
                    channel.ack(msg);
                }
            });
            process.on("beforeExit", () => {
                connection.close();
            });
        }))();
        ws.on("close", () => { });
        ws.on("disconnect", () => {
            console.log(`Client disconnected: ${ws === null || ws === void 0 ? void 0 : ws["id"]}`);
            wss.clients.delete(ws === null || ws === void 0 ? void 0 : ws["id"]);
        });
    }));
    server.listen(PORT, () => {
        var _a;
        console.log(`WebSocket server is running on port ${PORT} ${(_a = cluster_1.default.worker) === null || _a === void 0 ? void 0 : _a["id"]}`);
    });
    // server.on("upgrade", (request, socket, head) => {
    //   wss.handleUpgrade(request, socket, head, (ws) => {
    //     wss.emit("connection", ws, request);
    //   });
    // });
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
