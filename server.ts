import WebSocket from "ws";
import * as http from "http";
import * as fs from "fs";
import amqp from "amqplib";
import cluster from "cluster";
// import * as _cluster from "cluster";
// const cluster = _cluster as unknown as _cluster.Cluster;
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
  let rabbitConnection: any;
  amqp
    .connect("amqp://localhost")
    .then((connection) => {
      rabbitConnection = connection;
      return connection.createChannel();
    })
    .then((channel) => {
      const exchange = "cluster_exchange";
      channel.assertExchange(exchange, "fanout", { durable: false });
      const numCPUs = os.cpus().length;
      for (let i = 0; i < numCPUs; i++) {
        const worker = cluster.fork();

        const queue = `worker_${worker.id}_queue`;
        channel.assertQueue(queue, { durable: false });
        channel.bindQueue(queue, exchange, "");
      }
    })
    .catch((err) => {
      console.error("Error connecting to RabbitMQ:", err);
    });

  cluster.on("exit", (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
  });

  // Function to broadcast a message to all workers
  const broadcastEditRequest = (message: any) => {
    rabbitConnection
      .createChannel()
      .then((channel: any) => {
        const exchange = "cluster_exchange";
        channel.assertExchange(exchange, "fanout", { durable: false });
        channel.publish(exchange, "", Buffer.from(message));
      })
      .catch((err: any) => {
        console.error("Error broadcasting edit request:", err);
      });
  };

  // WebSocket server setup
  const server = http.createServer();
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws) => {
    // Handle WebSocket connections
    ws.on("message", async (message: any) => {
      // console.log(`Received WebSocket message: ${message}`);
      // Handle your WebSocket messages here

      // Example: Broadcast an edit request to all workers
      const msg: any = JSON.parse(message);
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
          const editRequestMessage = message;
          broadcastEditRequest(editRequestMessage);
        })();
      }
    });
  });

  server.listen(8081, () => {
    console.log("WebSocket server listening on port 8081");
  });
} else {
  const server = http.createServer();
  const wss = new WebSocket.Server({ server });

  let rabbitConnection: any;
  amqp
    .connect("amqp://localhost")
    .then((connection) => {
      rabbitConnection = connection;
      return connection.createChannel();
    })
    .then((channel) => {
      const exchange = "cluster_exchange";
      channel.assertExchange(exchange, "fanout", {
        durable: false,
      });
      const numCPUs = os.cpus().length;

      const queue = `worker_${cluster?.worker?.id}_queue`;
      channel.assertQueue(queue, { durable: false });
      channel.bindQueue(queue, exchange, "");
    })
    .catch((err) => {
      console.error("Error connecting to RabbitMQ:", err);
    });

  wss.on("connection", (ws) => {
    // Handle WebSocket connections in worker processes
    console.log(`client connected on worker - ${cluster.worker?.["id"]}`);
    ws.on("message", async (message) => {
      // console.log(
      //   `Worker ${cluster?.["worker"]?.["id"]} received WebSocket message: ${message}`
      // );

      // Handle your WebSocket messages here

      const broadcastEditRequest = async (message: any) => {
        let { connection, channel } = await connect();

        connection
          .createChannel()
          .then((channel: any) => {
            const exchange = "cluster_exchange";
            channel.assertExchange(exchange, "fanout", { durable: false });
            channel.publish(exchange, "", Buffer.from(message));
          })
          .catch((err: any) => {
            console.error("Error broadcasting edit request:", err);
          });
      };

      (async () => {
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
                return channel
                  .assertQueue("", { exclusive: true })
                  .then((q) => {
                    channel.bindQueue(q.queue, exchange, "");
                    channel.consume(
                      q.queue,
                      (msg: any) => {
                        if (msg.content) {
                          const message = msg.content.toString();
                          // console.log(
                          //   `Worker ${cluster?.worker?.id} received broadcasted message: ${message}`
                          // );
                          // Handle the broadcasted message here
                          handleMessage(JSON.parse(msg.content.toString()));
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
      })();
      try {
        if (message instanceof Buffer) {
          let msg: any = JSON.parse(message?.toString());

          // console.log("main action", msg?.action);
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
                  const message = msg?.content.toString();
                  // console.log(
                  //   `Worker ${cluster?.worker?.id} received broadcasted message: ${message}`
                  // );
                  // Handle the broadcasted message here
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

  server.listen(8081, "localhost", () => {
    const workerPort: any = server?.address();
    console.log(
      `Worker ${cluster?.["worker"]?.["id"]} WebSocket server listening on port ${workerPort?.port}`
    );
  });

  function handleMessage(message: any) {
    // console.log("Handle message called");

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
