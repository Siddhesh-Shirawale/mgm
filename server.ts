import WebSocket from "ws";
import * as http from "http";
import * as fs from "fs";
import amqp from "amqplib";
import cluster from "cluster";
import cors from "cors";

import os from "os";
import util from "util";

const readFileAsync = util.promisify(fs.readFile);
const PORT = 8081;
interface Product {
  id: number;
  title: string;
}

import { connect } from "./rabbitmq";

const productDataFile = "products.json";
process.setMaxListeners(20);

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

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  for (let i = 0; i < numCPUs; i++) {
    const worker = cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
  });
} else {
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  });
  const wss = new WebSocket.Server({ server });

  amqp
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
            channel.consume(
              q.queue,
              (msg) => {
                if (msg?.content) {
                  handleMessage(JSON.parse(msg?.content.toString()));
                }
              },
              { noAck: true }
            );
          });
        });
    })
    .catch((err) => {
      console.error(
        `Error setting up RabbitMQ connection in worker ${cluster?.worker?.id}:`,
        err
      );
    });
  wss.on("connection", (ws) => {
    ws.on("message", async (message) => {
      try {
        if (message instanceof Buffer) {
          let msg: any = JSON.parse(message?.toString());

          // console.log("main action", msg?.action);
          if (msg?.["action"] === "read") {
            const products = await readProductsAsync();

            const productsToSend = products.slice(0, 5);
            ws.send(JSON.stringify({ products: productsToSend }));
          } else if (msg?.["action"] === "detail") {
            // console.log("detail called");
            const products = await readProductsAsync();

            const product = products.find(
              (p: any) => p.id === Number(msg?.["productId"])
            );
            ws.send(JSON.stringify({ product: product, action: "detail" }));
          } else if (msg?.["action"] === "edit") {
            (async () => {
              const broadcastEditRequest = async (message: any) => {
                let { connection, channel } = await connect();

                connection
                  .createChannel()
                  .then((channel: any) => {
                    const exchange = "cluster_exchange";
                    channel.assertExchange(exchange, "fanout", {
                      durable: false,
                    });
                    channel.publish(exchange, "", Buffer.from(message));
                  })
                  .catch((err: any) => {
                    console.error("Error broadcasting edit request:", err);
                  });
              };

              const editRequestMessage = message;
              broadcastEditRequest(editRequestMessage);
            })();
          }
        }
      } catch (error) {
        console.log(error);
        console.error("Error parsing incoming message: Invalid message format");
      }
    });
  });
  // process.on("message", (message: any) => {
  //   // Forward WebSocket connections to the appropriate worker process
  //   wss.handleUpgrade(message.req, message.socket, message.head, (ws) => {
  //     wss.emit("connection", ws, message.req);
  //   });
  // });

  server.listen(PORT, () => {
    const workerPort: any = server?.address();
    console.log(
      `Worker ${cluster?.["worker"]?.["id"]} WebSocket server listening on port ${workerPort?.port}`
    );
  });

  function handleMessage(message: any) {
    console.log(`${cluster?.worker?.id} - handleMessage called`);

    switch (message.action) {
      case "edit":
        editProduct(message.product, (updatedProducts) => {
          const existingProduct: Product | any = updatedProducts.find(
            (p) => p.id === message.product.id
          );

          broadcastProducts(existingProduct, message.action, message.rowIndex);
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
          if (data) {
            const products = JSON.parse(data);
            callback(products?.["products"] || []);
          }
          // console.log("Successfully parsed products");
        } catch (parseError) {
          console.error("Error parsing products JSON:", parseError);
          callback([]);
        }
      }
    });
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
    // console.log(`${cluster?.worker?.id} - ${wss?.clients.size}`);
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
