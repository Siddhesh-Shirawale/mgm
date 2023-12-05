import WebSocket from "ws";
import * as http from "http";
import * as fs from "fs";
import amqp from "amqplib";
import cluster from "cluster";
import cors from "cors";

import os from "os";
import util from "util";

const PORT = process.env.PORT || 8081;
const HOST = process.env.HOST || "localhost";

const readFileAsync = util.promisify(fs.readFile);

interface Product {
  id: number;
  title: string;
}

import { connect } from "./rabbitmq";

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
  // console.log(`connected 0n worker - ${cluster?.["worker"]?.["id"]}`);
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

          // console.log("from details = ", products);

          const category = products?.find(
            (ct: any) => ct.id === msg.categoryId
          );

          if (category) {
            const product = category?.products?.find(
              (p: any) => p.id === msg?.productId
            );

            // console.log("Product", product);

            if (product) {
              ws.send(JSON.stringify({ product: product, action: "detail" }));
              // ws.send(JSON.stringify({ product, action: 'detail' }));
            } else {
              console.error(
                `Product with ID ${msg.productId} not found in category with ID ${msg.categoryId}`
              );
            }

            // const product = products.find(
            //   (p: any) => p.id === Number(msg?.["productId"])
            // );
          }
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
  // const workerPort: any = server?.address();
  console.log(` WebSocket server listening on port http://${HOST}:${PORT}`);
});

function handleMessage(message: any) {
  console.log(`${cluster?.worker?.id} - handleMessage called`);

  switch (message.action) {
    case "edit":
      editProduct(message.product, message.categoryId, (updatedProducts) => {
        const existingProduct: Product | any = updatedProducts.find(
          (p) => p.id === message.product.id
        );

        broadcastProducts(
          existingProduct,
          message.action,

          message.categoryId
        );
      });
      break;

    default:
      break;
  }
}

async function readProductsAsync() {
  try {
    const data = await readFileAsync(productDataFile, "utf-8");

    const products = JSON.parse(data);

    return products?.["categories"] || [];
  } catch (err) {
    console.error("Error reading or parsing products file:", err);
    return [];
  }
}

const editProduct = async (
  editedProduct: Product,
  categoryId: number,
  callback: (products: Product[]) => void
) => {
  const products = await readProductsAsync();
  const categoryIndex = products?.findIndex(
    (category: any) => category.id === categoryId
  );

  if (categoryIndex !== -1) {
    let updatedCategory: any = { ...products[categoryIndex] };
    let updatedProducts: any = [...updatedCategory.products];

    const existingProductIndex = updatedProducts.findIndex(
      (p: Product) => p.id === editedProduct.id
    );

    if (existingProductIndex !== -1) {
      updatedProducts[existingProductIndex] = {
        ...updatedProducts[existingProductIndex],
        ...editedProduct,
      };

      updatedCategory.products = updatedProducts;
      const updatedCategories = [...products];
      updatedCategories[categoryIndex] = updatedCategory;

      writeProducts(updatedCategories, editedProduct, () => {
        callback(updatedProducts);
      });
    }
  }
};

function writeProducts(
  categories: any,
  product: Product,
  callback: () => void
) {
  fs.readFile(productDataFile, "utf-8", (readErr, data) => {
    if (readErr) {
      console.error("Error reading products file:", readErr);
    } else {
      try {
        // const existingData = JSON.parse(data);

        const updatedJsonData = {
          categories: categories,
        };

        fs.writeFile(
          productDataFile,
          JSON.stringify(updatedJsonData, null, 2),
          "utf-8",
          (writeErr) => {
            if (writeErr) {
              console.error("Error writing the file:", writeErr);
            } else {
              callback();
            }
          }
        );

        return product;
      } catch (parseError) {
        console.error("Error parsing products JSON:", parseError);
      }
    }
  });
}

function broadcastProducts(
  products: Product[] | Product,
  action: string,
  categoryId: string
) {
  // console.log(`${cluster?.worker?.id} - ${wss?.clients.size}`);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          product: products,
          action: action,
          categoryId: categoryId,
        })
      );
    }
  });
}
// }
