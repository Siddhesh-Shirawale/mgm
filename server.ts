import * as WebSocket from "ws";
import * as http from "http";
import cluster from "cluster";
import * as fs from "fs";
import * as path from "path";

const numCPUs = require("os").cpus().length;

interface Product {
  id: number;
  title: string;
  // Other product properties
}

const productDataFile = "products.json";

if (cluster.isPrimary) {
  // Fork worker processes for each CPU core
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
  });
} else {
  const server = http.createServer(
    (req: http.IncomingMessage, res: http.ServerResponse) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("WebSocket server is running");
    }
  );

  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws: WebSocket) => {
    console.log(`WebSocket client connected on worker ${cluster.worker!.id}`);

    ws.on("message", (message) => {
      if (typeof message === "string") {
        // Ensure 'message' is a string

        console.log(message);
        handleMessage(ws, JSON.parse(message));
      } else if (message instanceof Buffer) {
        // Convert 'message' Buffer to a string
        console.log(JSON.parse(message.toString()));
        handleMessage(ws, JSON.parse(message.toString()));
      } else {
        console.error("Received an unsupported message type:", typeof message);
      }
    });
    ws.on("close", () => {
      console.log(
        `WebSocket client disconnected on worker ${cluster.worker!.id}`
      );
    });
  });

  server.listen(8080, () => {
    console.log(
      `WebSocket server is running on worker ${cluster.worker!.id}, port 8080`
    );
  });

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
        callback([]);
      } else {
        const products = JSON.parse(data);

        console.log(products.products[0]);

        callback(products);
      }
    });
  }

  function editProduct(
    editedProduct: Product,
    callback: (products: Product[]) => void
  ) {
    readProducts((products) => {
      const existingProductIndex = products.findIndex(
        (p) => p.id === editedProduct.id
      );
      if (existingProductIndex !== -1) {
        products[existingProductIndex] = editedProduct;
        writeProducts(products, () => {
          callback(products);
        });
      }
    });
  }

  function writeProducts(products: Product[], callback: () => void) {
    fs.writeFile(
      productDataFile,
      JSON.stringify(products, null, 2),
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

  function broadcastProducts(sender: WebSocket, products: Product[]) {
    wss.clients.forEach((client) => {
      if (client !== sender && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(products));
      }
    });
  }
}
