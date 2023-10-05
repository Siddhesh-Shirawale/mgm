import WebSocket from "ws";
import * as http from "http";
// import cluster from "cluster";
import * as fs from "fs";
import amqp from "amqplib";

// const numCPUs = require("os").cpus().length;

interface Product {
  id: number;
  title: string;
  // Other product properties
}

const productDataFile = "products.json";

// if (cluster.isPrimary) {
//   // Fork worker processes for each CPU core
//   for (let i = 0; i < numCPUs; i++) {
//     cluster.fork();
//   }

//   cluster.on("exit", (worker, code, signal) => {
//     console.log(`Worker ${worker.process.pid} died`);
//   });
// } else {
const server = http.createServer(
  (req: http.IncomingMessage, res: http.ServerResponse) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("WebSocket server is running");
  }
);

// const workerId = cluster.worker!.id; // Get the worker ID
// const port = 8080 + workerId; // Calculate the port based on the worker ID

const wss = new WebSocket.Server({
  server,
  maxPayload: 1024 * 1024,
  perMessageDeflate: false,
  clientTracking: true,
  // noServer: true,
});

wss.on("connection", (ws: WebSocket) => {
  // console.log(`WebSocket client connected on worker ${cluster.worker!.id}`);
  console.log("connected to server");

  // ws.send("connected to ws");

  ws.on("message", async (message) => {
    if (typeof message === "string") {
      // Ensure 'message' is a string

      // console.log(message);

      const connection = await amqp.connect("amqp://localhost");
      const channel = await connection.createChannel();

      // Declare a queue
      const queue = "websocket_queue";
      await channel.assertQueue(queue, { durable: false });

      // Send the message to RabbitMQ
      channel.sendToQueue(queue, Buffer.from(message));

      // Close RabbitMQ connection
      await channel.close();
      await connection.close();
    } else if (message instanceof Buffer) {
      // Convert 'message' Buffer to a string
      // console.log(JSON.parse(message.toString()));
      // handleMessage(ws, JSON.parse(message.toString()));

      const connection = await amqp.connect("amqp://localhost");
      const channel = await connection.createChannel();

      // Declare a queue
      const queue = "websocket_queue";
      await channel.assertQueue(queue, { durable: false });

      // Send the message to RabbitMQ
      channel.sendToQueue(queue, Buffer.from(message));

      // Close RabbitMQ connection
      await channel.close();
      await connection.close();
    } else {
      // console.error("Received an unsupported message type:", typeof message);
    }
  });
  ws.on("close", () => {
    // console.log(
    //   `WebSocket client disconnected on worker ${cluster.worker!.id}`
    // );
  });
});

server.listen(8080, () => {
  console.log(`WebSocket server is running on port 8080`);
});

async function consumeQueue() {
  const connection = await amqp.connect("amqp://localhost");
  const channel = await connection.createChannel();

  const queue = "websocket_queue";
  await channel.assertQueue(queue, { durable: false });

  channel.consume(queue, (msg) => {
    // console.log("96", msg);
    if (msg !== null) {
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          // client.send(msg.content.toString());
          handleMessage(client, JSON.parse(msg.content.toString()));
        }
      });

      // Acknowledge the message
      channel.ack(msg);
    }
  });
}

function handleMessage(ws: WebSocket, message: any) {
  switch (message.action) {
    case "create":
      createProduct(message.product, (updatedProducts) => {
        broadcastProducts(ws, updatedProducts);
      });
      break;
    case "read":
      readProducts((products) => {
        ws.send(JSON.stringify(products));
      });
      break;
    case "edit":
      editProduct(message.product, (updatedProducts) => {
        const existingProduct = updatedProducts.find(
          (p) => p.id === message.product.id
        );
        ws.send(JSON.stringify(existingProduct));
        broadcastProducts(ws, updatedProducts);
      });
      break;
    default:
      // Handle unsupported actions or errors
      break;
  }
}

function createProduct(
  newProduct: Product,
  callback: (products: Product[]) => void
) {
  readProducts((products) => {
    newProduct.id = Date.now(); // Generate a unique ID (timestamp-based)

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
      // Merge the existing product data with the new data
      const updatedProduct = { ...existingProduct, ...editedProduct };

      // Find the index of the existing product
      const existingProductIndex = products.indexOf(existingProduct);

      // Replace the existing product with the updated product in the array
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

function broadcastProducts(sender: WebSocket, products: Product[] | Product) {
  wss.clients.forEach((client) => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(products));
    }
  });
}
// }

consumeQueue();
