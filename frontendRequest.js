const ws = new WebSocket("ws://your-server-url:8080");

// Handle WebSocket connection open event
ws.addEventListener("open", () => {
  console.log("WebSocket connection opened");

  // Send a request to read products
  const readRequest = {
    action: "read",
  };
  ws.send(JSON.stringify(readRequest));
});

// Handle incoming WebSocket messages
ws.addEventListener("message", (event) => {
  const data = JSON.parse(event.data);
  console.log("Received data from server:", data);

  // Process the received data (product list) in your frontend
  // Example: Display products in a UI list
  displayProducts(data);
});

// Function to create a new product
function createProduct() {
  const newProduct = {
    id: 0, // The server will assign an ID
    title: "New Product",
    // Other product properties
  };

  const createRequest = {
    action: "create",
    product: newProduct,
  };
  ws.send(JSON.stringify(createRequest));
}

// Function to edit an existing product
function editProduct(productId, updatedData) {
  const editRequest = {
    action: "edit",
    product: {
      id: productId,
      ...updatedData,
    },
  };
  ws.send(JSON.stringify(editRequest));
}
