import WebSocket from "ws";
import * as http from "http";
import * as fs from "fs";
import amqp from "amqplib";
import cluster from "cluster";
import os from "os";
import util from "util";
import cors from "cors";
import sticky from "sticky-session";
const readFileAsync = util.promisify(fs.readFile); // Promisify the fs.readFile method
const PORT = 8081;
interface Product {
  id: number;
  title: string;
}

const productDataFile = "products.json";

// console.log("line 21", wssMap.size);
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
  const numCPUs = os.cpus().length;
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
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

  wss.setMaxListeners(1000);
  const rabbitMqUrl = "amqp://localhost";

  const queue = "editqueue";
  // console.log(channel);
  // Connect to RabbitMQ
  async function connectToRabbitMQ() {
    try {
      const connection = await amqp.connect(rabbitMqUrl);

      return connection;
    } catch (error) {
      console.error("Error creating RabbitMQ channel:", error);
      throw error;
    }
  }

  wss.on("connection", async (ws: any) => {
    // console.log(ws);
    // const heartbeatInterval = setInterval(() => {
    //   // Send a ping message to the client
    //   ws.ping();
    // }, 30000);

    connectToRabbitMQ()?.then(async (connection) => {
      console.log("Connected to RabbitMQ");

      let channel2 = await connection.createChannel();
      await channel2.assertQueue(queue, { durable: true });
      channel2.consume(queue, (message: any) => {
        console.log(wss?.clients.size);

        wss?.clients.forEach((client) => {
          console.log("client present");

          try {
            let msg = JSON.parse(message?.content?.toString());

            console.log(msg);

            if (msg?.["action"] === "edit") {
              handleMessage(client, JSON.parse(message.content.toString()));
            } else {
              console.log("consume queue action - ", msg?.["action"]);
            }
          } catch (error) {
            console.log("error parsing in consume");
          }
        });
      });
    });

    let connection = await connectToRabbitMQ();
    const channel = await connection.createChannel();
    await channel.assertQueue(queue, { durable: true });

    // When a WebSocket connection is established, forward messages to all workers
    // console.log("Client connected to Worker: " + cluster?.worker?.id);
    ws.on("message", async (message: any) => {
      try {
        if (message instanceof Buffer) {
          let msg: any = JSON.parse(message?.toString());

          console.log("main action", msg?.action);
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
          } else if (msg?.["action"] === "edit") {
            console.log(msg.action);
            console.log(msg);

            channel?.sendToQueue(queue, Buffer.from(message));
          } else {
            // console.log("else called");
            // channel.publish(exchangeName, "", Buffer.from(message));
            // console.log(JSON.parse(message.toString()));
            if (channel) {
              channel?.sendToQueue(queue, Buffer.from(message));
            } else {
              // const connection = await amqp.connect(rabbitMqUrl);
              // channel = await connection.createChannel();
              // await channel.assertQueue(queue);
              // channel?.sendToQueue(queue, Buffer.from(message));
              console.error("RabbitMQ channel is undefined.");
            }

            // setTimeout(() => {
            //   channel.close();
            //   // connection.close();
            // }, 500);
            // handleMessage(ws, JSON.parse(message?.toString()));
          }
        }
      } catch (error) {
        console.log(error);
        console.error("Error parsing incoming message: Invalid message format");
      }
    });

    ws.on("close", () => {
      // clearInterval(heartbeatInterval);
      // console.log("client disconnected");
      // reconnect();
    });

    ws.on("disconnect", () => {
      console.log(`Client disconnected: ${ws?.["id"]}`);
      wss.clients.delete(ws?.["id"]); // Remove disconnected client from the list
    });

    // ws.on("pong", () => {
    //   console.log("Received pong from client");
    // });

    // Listen for messages from RabbitMQ and send them to the WebSocket clients

    // connectToRabbitMQ()?.then(async (connection) => {
    //   console.log("Connected to RabbitMQ");

    //   let channel2 = await connection.createChannel();
    //   await channel2.assertQueue(queue, { durable: true });
    //   channel2.consume(queue, (message: any) => {
    //     // Handle RabbitMQ messages here and broadcast to connected clients
    //     // console.log("consume queue called");
    //     // console.log(message);

    //     console.log(wss?.clients.size);
    //     // console.log(wss);
    //     wss?.clients.forEach((client) => {
    //       console.log("client present");

    //       try {
    //         let msg = JSON.parse(message?.content?.toString());

    //         console.log(msg);

    //         if (msg?.["action"] === "edit") {
    //           handleMessage(client, JSON.parse(message.content.toString()));
    //         } else {
    //           console.log("consume queue action - ", msg?.["action"]);
    //         }
    //       } catch (error) {
    //         console.log("error parsing in consume");
    //       }
    //     });
    //   });
    // });
  });

  // connectToWebSocketServer();

  server.listen(PORT, () => {
    console.log(
      `WebSocket server is running on port ${PORT} ${cluster.worker?.["id"]}`
    );
  });

  // if (!sticky.listen(server, PORT)) {
  //   // This is the master process
  //   server.once("listening", () => {
  //     `WebSocket server is running on port ${PORT} ${cluster.worker?.["id"]}`;
  //   });
  // } else {
  //   // This is a worker process, so it will handle the WebSocket connections
  //   server.on("upgrade", (request, socket, head) => {
  //     wss.handleUpgrade(request, socket, head, (ws) => {
  //       wss.emit("connection", ws, request);
  //     });
  //   });
  // }

  function handleMessage(ws: WebSocket, message: any) {
    console.log("Handle message called");

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

        // console.log("read called");
        break;
      case "edit":
        // console.log("handleMessage edit called");
        editProduct(message.product, (updatedProducts) => {
          const existingProduct: Product | any = updatedProducts.find(
            (p) => p.id === message.product.id
          );

          // ws.send(
          //   JSON.stringify({
          //     product: existingProduct,
          //     action: message.action,
          //     rowIndex: message.rowIndex,
          //   })
          // );
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
