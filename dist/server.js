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
    const numCPUs = os_1.default.cpus().length;
    for (let i = 0; i < numCPUs; i++) {
        const worker = cluster_1.default.fork();
    }
    cluster_1.default.on("exit", (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
    });
}
else {
    const server = http.createServer((req, res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    });
    const wss = new ws_1.default.Server({ server });
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
    wss.on("connection", (ws) => {
        ws.on("message", (message) => __awaiter(void 0, void 0, void 0, function* () {
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
                        // console.log("detail called");
                        const products = yield readProductsAsync();
                        const product = products.find((p) => p.id === Number(msg === null || msg === void 0 ? void 0 : msg["productId"]));
                        ws.send(JSON.stringify({ product: product, action: "detail" }));
                    }
                    else if ((msg === null || msg === void 0 ? void 0 : msg["action"]) === "edit") {
                        (() => __awaiter(void 0, void 0, void 0, function* () {
                            const broadcastEditRequest = (message) => __awaiter(void 0, void 0, void 0, function* () {
                                let { connection, channel } = yield (0, rabbitmq_1.connect)();
                                connection
                                    .createChannel()
                                    .then((channel) => {
                                    const exchange = "cluster_exchange";
                                    channel.assertExchange(exchange, "fanout", {
                                        durable: false,
                                    });
                                    channel.publish(exchange, "", Buffer.from(message));
                                })
                                    .catch((err) => {
                                    console.error("Error broadcasting edit request:", err);
                                });
                            });
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
    // process.on("message", (message: any) => {
    //   // Forward WebSocket connections to the appropriate worker process
    //   wss.handleUpgrade(message.req, message.socket, message.head, (ws) => {
    //     wss.emit("connection", ws, message.req);
    //   });
    // });
    server.listen(PORT, () => {
        var _a;
        const workerPort = server === null || server === void 0 ? void 0 : server.address();
        console.log(`Worker ${(_a = cluster_1.default === null || cluster_1.default === void 0 ? void 0 : cluster_1.default["worker"]) === null || _a === void 0 ? void 0 : _a["id"]} WebSocket server listening on port ${workerPort === null || workerPort === void 0 ? void 0 : workerPort.port}`);
    });
    function handleMessage(message) {
        var _a;
        console.log(`${(_a = cluster_1.default === null || cluster_1.default === void 0 ? void 0 : cluster_1.default.worker) === null || _a === void 0 ? void 0 : _a.id} - handleMessage called`);
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
        // console.log(`${cluster?.worker?.id} - ${wss?.clients.size}`);
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
