import WebSocket from "ws";
import * as http from "http";
import * as fs from "fs";
import amqp from "amqplib";
import cluster from "cluster";
import os from "os";
import util from "util";
import cors from "cors";

const readFileAsync = util.promisify(fs.readFile); //
const productDataFile = "products.json";
const PORT = 8080;
interface Product {
  id: number;
  title: string;
}

const wss = new WebSocket.Server({ noServer: true });
const sharedClients = new Set<WebSocket>();

// Shared AMQP connection and channel
let amqpChannel: any;
const setUpWebsocketServer = async () => {
  const amqpConnection = await amqp.connect("amqp://localhost");
  amqpChannel = await amqpConnection.createChannel();
};

setUpWebsocketServer();

// console.log("line 21", wssMap.size);

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
  });
} else {
  async function setupWebSocketServer() {
    // console.log(`Client added to worker: ${cluster?.["worker"]?.["id"]}`);

    wss.on("connection", (ws: WebSocket) => {
      console.log("Client connected to Worker: " + cluster?.worker?.id);
      sharedClients.add(ws);

      ws.on("message", async (message) => {
        console.log("Message received");
        if (typeof message === "string") {
          console.log("messageTypeString", message);
          let action: any = JSON.parse(message);

          console.log("61", message);
          if (action?.["action"] === "read") {
            const products = await readProductsAsync();
            const productsToSend = products.slice(0, 5);
            ws.send(JSON.stringify({ products: productsToSend }));
          } else if (action?.["action"] === "detail") {
            const products = await readProductsAsync();

            const product = products.find(
              (p: any) => p.id === Number(action?.["productId"])
            );
            ws.send(JSON.stringify({ product: product, action: "detail" }));
          } else {
            const queue = "websocket_queue";
            await amqpChannel.assertQueue(queue, { durable: false });

            amqpChannel.sendToQueue(queue, Buffer.from(message));
            consumeQueue();

            // Close RabbitMQ connection
            // await channel.close();
            // await connection.close();
          }
        } else if (message instanceof Buffer) {
          let msg: any = JSON.parse(message.toString());
          console.log("102", JSON.parse(message.toString()));
          if (msg?.["action"] === "read") {
            const products = await readProductsAsync();
            const productsToSend = products.slice(0, 5);
            ws.send(JSON.stringify({ products: productsToSend }));
          } else if (msg?.["action"] === "detail") {
            const products = await readProductsAsync();

            const product = products.find(
              (p: any) => p.id === Number(msg?.["productId"])
            );
            ws.send(JSON.stringify({ product: product, action: "detail" }));
          } else {
            const queue = "websocket_queue";
            await amqpChannel.assertQueue(queue, { durable: false });

            amqpChannel.sendToQueue(queue, Buffer.from(message));
            consumeQueue();
            // await channel.close();
            // await connection.close();
          }
        } else {
          console.error(
            "Received an unsupported message type:",
            typeof message
          );
        }
      });
      ws.on("close", (code, reason) => {
        console.log(
          "Client disconnected with code:",
          code,
          "and reason:",
          reason.toString()
        );
      });
    });
  }

  // Use the same amqpChannel for all workers
  amqpChannel.assertQueue("websocket_queue", { durable: false });
  amqpChannel.consume("websocket_queue", async (msg) => {
    if (msg !== null) {
      try {
        const message = JSON.parse(msg.content.toString());

        // Process the message and broadcast to connected clients
        sharedClients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
          }
        });
      } catch (error) {
        console.error("Error processing AMQP message:", error);
      }

      amqpChannel.ack(msg);
    }
  });

  async function consumeQueue() {
    // console.log("consume queue called");
    const connection = await amqp.connect("amqp://localhost");
    const channel = await connection.createChannel();

    const queue = "websocket_queue";
    await channel.assertQueue(queue, { durable: false });

    console.log("consumQueue called");

    channel.consume(queue, async (msg) => {
      if (msg !== null) {
        let processResult: any;

        console.log("consumeQueueMSG = ", JSON.parse(msg.content.toString()));

        sharedClients.forEach((client) => {
          console.log("consumeQueue", client);
          if (client.readyState === WebSocket.OPEN && !processResult) {
            console.log("client in ready state");
            const message = JSON.parse(msg.content.toString());

            processResult = handleMessage(client, message);
          }
        });

        if (processResult) {
          await sendToResponseQueue(processResult);
        }
        channel.ack(msg);
      }
    });
  }

  async function sendToResponseQueue(processResult: any) {
    const queue = "response_queue";
    await amqpChannel.assertQueue(queue, { durable: false });
    amqpChannel.sendToQueue(queue, Buffer.from(JSON.stringify(processResult)));
    await amqpChannel.close();
  }

  function handleMessage(ws: WebSocket, message: any) {
    console.log("Inside handleMessage, message:", message);
    console.log("229", message);
    console.log("203", message.action);
    console.log("204", message.productId);
    switch (message.action) {
      case "create":
        createProduct(message.product, (updatedProducts) => {
          broadcastProducts(
            updatedProducts,
            message.action,
            message?.["rowIndex"]
          );
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
          const existingProduct: Product | any = updatedProducts.find(
            (p) => p.id === message.product.id
          );

          ws.send(JSON.stringify(existingProduct));
          broadcastProducts(existingProduct, message.action, message.rowIndex);
        });
        break;
      case "detail":
        readProducts((products) => {
          const product = products.find(
            (p) => p.id === Number(message.productId)
          );
          ws.send(JSON.stringify({ action: "detail", products: product }));
        });
        break;
      default:
        break;
    }
  }

  function createProduct(
    newProduct: Product,
    callback: (products: Product[]) => void
  ) {
    readProducts((products) => {
      newProduct.id = Date.now();

      products.push(newProduct);
      writeProducts(products, () => {
        callback(products);
      });
    });
  }

  function readProducts(callback: (products: Product[]) => void) {
    fs.readFile(productDataFile, "utf-8", (err, data) => {
      console.log("Inside readProducts, data read:", data);
      if (err) {
        console.error("Error reading products file:", err);
        callback([]);
      } else {
        try {
          const products = JSON.parse(data);
          console.log("Successfully parsed products");

          callback(products?.["products"] || []);
        } catch (parseError) {
          console.error("Error parsing products JSON:", parseError);
          callback([]);
        }
      }
    });
  }

  async function readProductsAsync() {
    try {
      const data = await readFileAsync(productDataFile, "utf-8");
      // console.log("Inside readProducts, data read:", data);
      const products = JSON.parse(data);
      // console.log("Successfully parsed products");
      return products?.["products"] || [];
    } catch (err) {
      // console.error("Error reading or parsing products file:", err);
      return [];
    }
  }
  function editProduct(
    editedProduct: Product,
    callback: (products: Product[]) => void
  ) {
    console.log("editProduct function called");
    readProducts((products) => {
      const existingProduct: any = products.find(
        (p) => p.id === editedProduct.id
      );
      if (existingProduct) {
        const updatedProduct = { ...existingProduct, ...editedProduct };

        const existingProductIndex = products.indexOf(existingProduct);

        products[existingProductIndex] = updatedProduct;

        writeProducts(products, () => {
          callback(products);
        });
      }
    });
  }

  function writeProducts(products: Product[], callback: () => void) {
    console.log("Write product function called");
    let updatedProducts = { products: products };
    fs.writeFile(
      productDataFile,
      JSON.stringify(updatedProducts, null, 2),
      "utf-8",
      (err) => {
        if (err) {
          console.error("Error writing the file:", err);
        } else {
          callback();
        }
      }
    );
  }

  function broadcastProducts(
    products: Product[] | Product,
    action: string,
    rowIndex: Number | null
  ) {
    console.log("broadcast product function called");
    sharedClients.forEach((server, workerId) => {
      console.log(workerId);

      server.clients.forEach((client) => {
        console.log(client);
        if (client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({
              product: products,
              action: action,
              rowIndex: rowIndex,
            })
          );
        }
      });
    });
  }
}
