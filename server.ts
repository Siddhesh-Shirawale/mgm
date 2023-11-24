import WebSocket from "ws";
import * as http from "http";
import * as fs from "fs";
import amqp from "amqplib";
import cluster from "cluster";
import os from "os";
import util from "util";
import cors from "cors";
import sticky from "sticky-session";
const readFileAsync = util.promisify(fs.readFile);
const PORT = 8081;
interface Product {
  id: number;
  title: string;
}

import { connect } from "./rabbitmq";

const productDataFile = "products.json";

const server = http.createServer(
  (req: http.IncomingMessage, res: http.ServerResponse) => {
    cors()(req, res, () => {
      res.writeHead(200, {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end("WebSocket server is running");
    });
  }
);

if (cluster.isPrimary) {
  const workerSockets: any = [];

  // Fork workers
  const numCPUs = os.cpus().length;
  for (let i = 0; i < numCPUs; i++) {
    const worker = cluster.fork();
    workerSockets.push(worker);
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
  });
} else {
  const wss = new WebSocket.Server({
    server,
    maxPayload: 1024 * 1024,
    perMessageDeflate: false,
    clientTracking: true,
  });

  wss.on("connection", async (ws: any) => {
    ws.on("message", async (message: any) => {
      try {
        if (message instanceof Buffer) {
          let msg: any = JSON.parse(message?.toString());

          console.log(`client connected on worker - ${cluster.worker?.["id"]}`);

          console.log("main action", msg?.action);
          if (msg?.["action"] === "read") {
            const products = await readProductsAsync();

            const productsToSend = products.slice(0, 5);
            ws.send(JSON.stringify({ products: productsToSend }));
          } else if (msg?.["action"] === "detail") {
            console.log("detail called");
            const products = await readProductsAsync();

            const product = products.find(
              (p: any) => p.id === Number(msg?.["productId"])
            );
            ws.send(JSON.stringify({ product: product, action: "detail" }));
          } else if (msg?.["action"] === "edit") {
            (async () => {
              const { connection, channel } = await connect();

              const queueName = "editqueue";
              await channel.assertQueue(queueName);

              console.log("Send to queue called");
              channel.sendToQueue(queueName, Buffer.from(message));

              process.on("beforeExit", () => {
                connection.close();
              });
            })();
          }
        }
      } catch (error) {
        console.log(error);
        console.error("Error parsing incoming message: Invalid message format");
      }
    });

    (async () => {
      const { connection, channel } = await connect();

      const queueName = "editqueue";
      await channel.assertQueue(queueName);

      console.log(
        `Worker ${cluster?.["worker"]?.["id"]} is waiting for messages...`
      );

      channel.consume(queueName, (msg: any) => {
        console.log("Consume queue called");
        if (msg !== null) {
          wss?.clients.forEach((client) => {
            try {
              let message = JSON.parse(msg?.["content"]?.toString());

              if (message?.["action"] === "edit") {
                handleMessage(client, JSON.parse(msg?.content.toString()));
              } else {
                console.log("consume queue action - ", message?.["action"]);
              }
            } catch (error) {
              console.log("error parsing in consume");
            }
          });

          channel.ack(msg);
        }
      });

      process.on("beforeExit", () => {
        connection.close();
      });
    })();

    ws.on("close", () => {});

    ws.on("disconnect", () => {
      console.log(`Client disconnected: ${ws?.["id"]}`);
      wss.clients.delete(ws?.["id"]);
    });
  });

  server.listen(PORT, () => {
    console.log(
      `WebSocket server is running on port ${PORT} ${cluster.worker?.["id"]}`
    );
  });

  function handleMessage(ws: WebSocket, message: any) {
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
          const existingProduct: Product | any = updatedProducts.find(
            (p) => p.id === message.product.id
          );

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

  function readProducts(callback: (products: Product[]) => void) {
    // console.log("readProducts called");
    fs.readFile(productDataFile, "utf-8", (err, data) => {
      if (err) {
        console.error("Error reading products file:", err);
        callback([]);
      } else {
        try {
          const products = JSON.parse(data);
          // console.log("Successfully parsed products");

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
      // console.log("readProductsAsync called");
      const products = JSON.parse(data);

      return products?.["products"] || [];
    } catch (err) {
      console.error("Error reading or parsing products file:", err);
      return [];
    }
  }
  function editProduct(
    editedProduct: Product,
    callback: (products: Product[]) => void
  ) {
    // console.log("editProduct function called");
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
    // console.log("Write product function called");
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
    console.log(wss?.clients.size);
    wss.clients.forEach((client) => {
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
  }
}
