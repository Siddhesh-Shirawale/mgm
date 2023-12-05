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
const util_1 = __importDefault(require("util"));
const PORT = process.env.PORT || 8081;
const HOST = process.env.HOST || "localhost";
const readFileAsync = util_1.default.promisify(fs.readFile);
const rabbitmq_1 = require("./rabbitmq");
const productDataFile = "products.json";
process.setMaxListeners(1000000);
// if (cluster.isPrimary) {
//   const numCPUs = os.cpus().length;
//   for (let i = 0; i < numCPUs; i++) {
//     const worker = cluster.fork();
//   }
//   cluster.on("exit", (worker, code, signal) => {
//     console.log(`Worker ${worker.process.pid} died`);
//   });
// } else {
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
    // console.log(`connected 0n worker - ${cluster?.["worker"]?.["id"]}`);
    ws.on("message", (message) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
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
                    // console.log("from details = ", products);
                    const category = products === null || products === void 0 ? void 0 : products.find((ct) => ct.id === msg.categoryId);
                    if (category) {
                        const product = (_a = category === null || category === void 0 ? void 0 : category.products) === null || _a === void 0 ? void 0 : _a.find((p) => p.id === (msg === null || msg === void 0 ? void 0 : msg.productId));
                        // console.log("Product", product);
                        if (product) {
                            ws.send(JSON.stringify({ product: product, action: "detail" }));
                            // ws.send(JSON.stringify({ product, action: 'detail' }));
                        }
                        else {
                            console.error(`Product with ID ${msg.productId} not found in category with ID ${msg.categoryId}`);
                        }
                        // const product = products.find(
                        //   (p: any) => p.id === Number(msg?.["productId"])
                        // );
                    }
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
    // const workerPort: any = server?.address();
    console.log(` WebSocket server listening on port http://${HOST}:${PORT}`);
});
function handleMessage(message) {
    var _a;
    console.log(`${(_a = cluster_1.default === null || cluster_1.default === void 0 ? void 0 : cluster_1.default.worker) === null || _a === void 0 ? void 0 : _a.id} - handleMessage called`);
    switch (message.action) {
        case "edit":
            editProduct(message.product, message.categoryId, (updatedProducts) => {
                const existingProduct = updatedProducts.find((p) => p.id === message.product.id);
                broadcastProducts(existingProduct, message.action, message.categoryId);
            });
            break;
        default:
            break;
    }
}
function readProductsAsync() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const data = yield readFileAsync(productDataFile, "utf-8");
            const products = JSON.parse(data);
            return (products === null || products === void 0 ? void 0 : products["categories"]) || [];
        }
        catch (err) {
            console.error("Error reading or parsing products file:", err);
            return [];
        }
    });
}
const editProduct = (editedProduct, categoryId, callback) => __awaiter(void 0, void 0, void 0, function* () {
    const products = yield readProductsAsync();
    const categoryIndex = products === null || products === void 0 ? void 0 : products.findIndex((category) => category.id === categoryId);
    if (categoryIndex !== -1) {
        let updatedCategory = Object.assign({}, products[categoryIndex]);
        let updatedProducts = [...updatedCategory.products];
        const existingProductIndex = updatedProducts.findIndex((p) => p.id === editedProduct.id);
        if (existingProductIndex !== -1) {
            updatedProducts[existingProductIndex] = Object.assign(Object.assign({}, updatedProducts[existingProductIndex]), editedProduct);
            updatedCategory.products = updatedProducts;
            const updatedCategories = [...products];
            updatedCategories[categoryIndex] = updatedCategory;
            writeProducts(updatedCategories, editedProduct, () => {
                callback(updatedProducts);
            });
        }
    }
});
function writeProducts(categories, product, callback) {
    fs.readFile(productDataFile, "utf-8", (readErr, data) => {
        if (readErr) {
            console.error("Error reading products file:", readErr);
        }
        else {
            try {
                // const existingData = JSON.parse(data);
                const updatedJsonData = {
                    categories: categories,
                };
                fs.writeFile(productDataFile, JSON.stringify(updatedJsonData, null, 2), "utf-8", (writeErr) => {
                    if (writeErr) {
                        console.error("Error writing the file:", writeErr);
                    }
                    else {
                        callback();
                    }
                });
                return product;
            }
            catch (parseError) {
                console.error("Error parsing products JSON:", parseError);
            }
        }
    });
}
function broadcastProducts(products, action, categoryId) {
    // console.log(`${cluster?.worker?.id} - ${wss?.clients.size}`);
    wss.clients.forEach((client) => {
        if (client.readyState === ws_1.default.OPEN) {
            client.send(JSON.stringify({
                product: products,
                action: action,
                categoryId: categoryId,
            }));
        }
    });
}
// }
