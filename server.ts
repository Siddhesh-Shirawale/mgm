import WebSocket from "ws";
import * as http from "http";
import * as fs from "fs";
import amqp from "amqplib";
import cluster from "cluster";
import os from "os";

interface Product {
  id: number;
  title: string;
}

const productDataFile = "products.json";

const wssMap = new Map<number, WebSocket.Server>();

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
  });
} else {
  async function createRabbitMQConnection() {
    const connection = await amqp.connect("amqp://localhost");
    return connection;
  }
  const server = http.createServer(
    (req: http.IncomingMessage, res: http.ServerResponse) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("WebSocket server is running");
    }
  );

  const wss = new WebSocket.Server({
    server,
    maxPayload: 1024 * 1024,
    perMessageDeflate: false,
    clientTracking: true,
  });

  wssMap.set(Number(cluster?.["worker"]?.["id"]), wss);

  wss.on("connection", (ws: WebSocket) => {
    console.log("connected to server");

    ws.on("message", async (message) => {
      if (typeof message === "string") {
        const connection = await createRabbitMQConnection();

        const channel = await connection.createChannel();

        // Declare a queue
        const queue = "websocket_queue";
        await channel.assertQueue(queue, { durable: false });

        channel.sendToQueue(queue, Buffer.from(message));

        // Close RabbitMQ connection
        await channel.close();
        await connection.close();
      } else if (message instanceof Buffer) {
        const connection = await createRabbitMQConnection();

        const channel = await connection.createChannel();

        const queue = "websocket_queue";
        await channel.assertQueue(queue, { durable: false });

        channel.sendToQueue(queue, Buffer.from(message));

        await channel.close();
        await connection.close();
      } else {
        console.error("Received an unsupported message type:", typeof message);
      }
    });
    ws.on("close", () => {});
  });

  consumeQueue();

  server.listen(8080, () => {
    console.log(
      `WebSocket server is running on port 8080 ${cluster.worker?.["id"]}`
    );
  });

  async function consumeQueue() {
    const connection = await amqp.connect("amqp://localhost");
    const channel = await connection.createChannel();

    const queue = "websocket_queue";
    await channel.assertQueue(queue, { durable: false });

    channel.consume(queue, (msg) => {
      if (msg !== null) {
        wss.clients.forEach((client) => {
          console.log(client);
          if (client.readyState === WebSocket.OPEN) {
            console.log("client in readystate");
            handleMessage(client, JSON.parse(msg.content.toString()));
          }
        });

        channel.ack(msg);
      }
    });
  }

  function handleMessage(ws: WebSocket, message: any) {
    console.log(ws);
    switch (message.action) {
      case "create":
        createProduct(message.product, (updatedProducts) => {
          broadcastProducts(updatedProducts);
        });
        break;
      case "read":
        readProducts((products) => {
          const productsToSend = products.slice(0, 10);
          ws.send(JSON.stringify(productsToSend));
        });

        console.log("read called");
        break;
      case "edit":
        editProduct(message.product, (updatedProducts) => {
          const existingProduct = updatedProducts.find(
            (p) => p.id === message.product.id
          );
          ws.send(JSON.stringify(existingProduct));
          broadcastProducts(updatedProducts);
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
      if (err) {
        console.error("Error reading products file:", err);
        callback([]);
      } else {
        try {
          const products = JSON.parse(data);
          console.log("Products from file:", products);
          callback(products?.["products"] || []);
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

  function broadcastProducts(products: Product[] | Product) {
    wssMap.forEach((wss, workerId) => {
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(products));
        }
      });
    });
  }
}
