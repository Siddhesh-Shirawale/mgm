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
// import * as _cluster from "cluster";
// const cluster = _cluster as unknown as _cluster.Cluster;
const os_1 = __importDefault(require("os"));
const util_1 = __importDefault(require("util"));
const readFileAsync = util_1.default.promisify(fs.readFile);
const PORT = 8081;
const rabbitmq_1 = require("./rabbitmq");
const productDataFile = "products.json";
process.setMaxListeners(20);
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
if (cluster_1.default.isPrimary) {
    let rabbitConnection;
    amqplib_1.default
        .connect("amqp://localhost")
        .then((connection) => {
        rabbitConnection = connection;
        return connection.createChannel();
    })
        .then((channel) => {
        const exchange = "cluster_exchange";
        channel.assertExchange(exchange, "fanout", { durable: false });
        const numCPUs = os_1.default.cpus().length;
        for (let i = 0; i < numCPUs; i++) {
            const worker = cluster_1.default.fork();
            const queue = `worker_${worker.id}_queue`;
            channel.assertQueue(queue, { durable: false });
            channel.bindQueue(queue, exchange, "");
        }
    })
        .catch((err) => {
        console.error("Error connecting to RabbitMQ:", err);
    });
    cluster_1.default.on("exit", (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
    });
    // Function to broadcast a message to all workers
    const broadcastEditRequest = (message) => {
        rabbitConnection
            .createChannel()
            .then((channel) => {
            const exchange = "cluster_exchange";
            channel.assertExchange(exchange, "fanout", { durable: false });
            channel.publish(exchange, "", Buffer.from(message));
        })
            .catch((err) => {
            console.error("Error broadcasting edit request:", err);
        });
    };
    function handleMessage(message) {
        // console.log("Handle message called");
        switch (message.action) {
            case "edit":
                editProduct(message.product, (updatedProducts) => {
                    const existingProduct = updatedProducts.find((p) => p.id === message.product.id);
                    broadcastProducts(existingProduct, message.action, message.rowIndex);
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
                    if (data) {
                        const products = JSON.parse(data);
                        callback((products === null || products === void 0 ? void 0 : products["products"]) || []);
                    }
                    // console.log("Successfully parsed products");
                }
                catch (parseError) {
                    console.error("Error parsing products JSON:", parseError);
                    callback([]);
                }
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
    // WebSocket server setup
    const server = http.createServer();
    const wss = new ws_1.default.Server({ noServer: true });
    server.on("upgrade", (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit("connection", ws, request);
        });
    });
    wss.on("connection", (ws) => {
        // Handle WebSocket connections
        ws.on("message", (message) => __awaiter(void 0, void 0, void 0, function* () {
            // console.log(`Received WebSocket message: ${message}`);
            // Handle your WebSocket messages here
            // Example: Broadcast an edit request to all workers
            const msg = JSON.parse(message);
            if ((msg === null || msg === void 0 ? void 0 : msg["action"]) === "read") {
                const products = yield readProductsAsync();
                const productsToSend = products.slice(0, 5);
                ws.send(JSON.stringify({ products: productsToSend }));
            }
            else if ((msg === null || msg === void 0 ? void 0 : msg["action"]) === "detail") {
                // console.log("detail called");
                const products = yield readProductsAsync();
                const product = products.find((p) => p.id === Number(msg === null || msg === void 0 ? void 0 : msg["productId"]));
                ws.send(JSON.stringify({ product: product, action: "detail" }));
            }
            else if ((msg === null || msg === void 0 ? void 0 : msg["action"]) === "edit") {
                (() => __awaiter(void 0, void 0, void 0, function* () {
                    const editRequestMessage = message;
                    broadcastEditRequest(editRequestMessage);
                }))();
                handleMessage(JSON.parse(message));
            }
        }));
    });
    server.listen(8081, () => {
        console.log("WebSocket server listening on port 8081");
    });
}
else {
    // const server = http.createServer();
    // const wss = new WebSocket.Server({ server });
    const wss = new ws_1.default.Server({ noServer: true });
    let rabbitConnection;
    amqplib_1.default
        .connect("amqp://localhost")
        .then((connection) => {
        rabbitConnection = connection;
        return connection.createChannel();
    })
        .then((channel) => {
        var _a;
        const exchange = "cluster_exchange";
        channel.assertExchange(exchange, "fanout", {
            durable: false,
        });
        const numCPUs = os_1.default.cpus().length;
        const queue = `worker_${(_a = cluster_1.default === null || cluster_1.default === void 0 ? void 0 : cluster_1.default.worker) === null || _a === void 0 ? void 0 : _a.id}_queue`;
        channel.assertQueue(queue, { durable: false });
        channel.bindQueue(queue, exchange, "");
    })
        .catch((err) => {
        console.error("Error connecting to RabbitMQ:", err);
    });
    wss.on("connection", (ws) => {
        var _a;
        // Handle WebSocket connections in worker processes
        console.log(`client connected on worker - ${(_a = cluster_1.default.worker) === null || _a === void 0 ? void 0 : _a["id"]}`);
        ws.on("message", (message) => __awaiter(void 0, void 0, void 0, function* () {
            // console.log(
            //   `Worker ${cluster?.["worker"]?.["id"]} received WebSocket message: ${message}`
            // );
            // Handle your WebSocket messages here
            const broadcastEditRequest = (message) => __awaiter(void 0, void 0, void 0, function* () {
                let { connection, channel } = yield (0, rabbitmq_1.connect)();
                connection
                    .createChannel()
                    .then((channel) => {
                    const exchange = "cluster_exchange";
                    channel.assertExchange(exchange, "fanout", { durable: false });
                    channel.publish(exchange, "", Buffer.from(message));
                })
                    .catch((err) => {
                    console.error("Error broadcasting edit request:", err);
                });
            });
            (() => __awaiter(void 0, void 0, void 0, function* () {
                amqplib_1.default
                    .connect("amqp://localhost")
                    .then((connection) => {
                    return connection.createChannel();
                })
                    .then((channel) => {
                    const exchange = "cluster_exchange";
                    return channel
                        .assertExchange(exchange, "fanout", { durable: false })
                        .then(() => {
                        return channel
                            .assertQueue("", { exclusive: true })
                            .then((q) => {
                            channel.bindQueue(q.queue, exchange, "");
                            channel.consume(q.queue, (msg) => {
                                if (msg.content) {
                                    const message = msg.content.toString();
                                    // console.log(
                                    //   `Worker ${cluster?.worker?.id} received broadcasted message: ${message}`
                                    // );
                                    // Handle the broadcasted message here
                                    handleMessage(JSON.parse(msg.content.toString()));
                                }
                            }, { noAck: true });
                        });
                    });
                })
                    .catch((err) => {
                    var _a;
                    console.error(`Error setting up RabbitMQ connection in worker ${(_a = cluster_1.default === null || cluster_1.default === void 0 ? void 0 : cluster_1.default.worker) === null || _a === void 0 ? void 0 : _a.id}:`, err);
                });
            }))();
            try {
                if (message instanceof Buffer) {
                    let msg = JSON.parse(message === null || message === void 0 ? void 0 : message.toString());
                    // console.log("main action", msg?.action);
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
                            const editRequestMessage = message;
                            broadcastEditRequest(editRequestMessage);
                        }))();
                    }
                }
            }
            catch (error) {
                console.log(error);
                console.error("Error parsing incoming message: Invalid message format");
            }
        }));
    });
    process.on("message", (message) => {
        // Forward WebSocket connections to the appropriate worker process
        wss.handleUpgrade(message.req, message.socket, message.head, (ws) => {
            wss.emit("connection", ws, message.req);
        });
    });
    amqplib_1.default
        .connect("amqp://localhost")
        .then((connection) => {
        return connection.createChannel();
    })
        .then((channel) => {
        const exchange = "cluster_exchange";
        return channel
            .assertExchange(exchange, "fanout", { durable: false })
            .then(() => {
            return channel.assertQueue("", { exclusive: true }).then((q) => {
                channel.bindQueue(q.queue, exchange, "");
                channel.consume(q.queue, (msg) => {
                    if (msg === null || msg === void 0 ? void 0 : msg.content) {
                        const message = msg === null || msg === void 0 ? void 0 : msg.content.toString();
                        // console.log(
                        //   `Worker ${cluster?.worker?.id} received broadcasted message: ${message}`
                        // );
                        // Handle the broadcasted message here
                        handleMessage(JSON.parse(msg === null || msg === void 0 ? void 0 : msg.content.toString()));
                    }
                }, { noAck: true });
            });
        });
    })
        .catch((err) => {
        var _a;
        console.error(`Error setting up RabbitMQ connection in worker ${(_a = cluster_1.default === null || cluster_1.default === void 0 ? void 0 : cluster_1.default.worker) === null || _a === void 0 ? void 0 : _a.id}:`, err);
    });
    // server.listen(8081, "localhost", () => {
    //   const workerPort: any = server?.address();
    //   console.log(
    //     `Worker ${cluster?.["worker"]?.["id"]} WebSocket server listening on port ${workerPort?.port}`
    //   );
    // });
    function handleMessage(message) {
        // console.log("Handle message called");
        switch (message.action) {
            case "edit":
                editProduct(message.product, (updatedProducts) => {
                    const existingProduct = updatedProducts.find((p) => p.id === message.product.id);
                    broadcastProducts(existingProduct, message.action, message.rowIndex);
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
                    if (data) {
                        const products = JSON.parse(data);
                        callback((products === null || products === void 0 ? void 0 : products["products"]) || []);
                    }
                    // console.log("Successfully parsed products");
                }
                catch (parseError) {
                    console.error("Error parsing products JSON:", parseError);
                    callback([]);
                }
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
