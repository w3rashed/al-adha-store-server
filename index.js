import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// CORS Configuration
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://al-adha-server.up.railway.app",
      "https://al-ada-hstore-49okw9o2c-rasheds-projects-cb9f1b79.vercel.app",
      "https://al-ada-hstore.vercel.app",
    ], // Frontend origins
    credentials: true, // Allow credentials (cookies, authorization headers)
  })
);

app.use(express.json()); // Parse JSON requests

// MongoDB connection setup
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.h1umx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// JWT Middleware to verify token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]; // Extract Bearer token
  if (!token) {
    return res.status(403).send({ message: "No token provided" });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Invalid token" });
    }
    req.user = decoded;
    next();
  });
};

// Start MongoDB connection and API endpoints
async function run() {
  try {
    await client.connect(); // Connect to MongoDB
    console.log("Connected to MongoDB!");

    const userCollection = client.db("al-ada-store").collection("users");
    const orderCollection = client.db("al-ada-store").collection("orders");

    // Logging request origin for CORS debugging
    app.use((req, res, next) => {
      console.log("Request Origin:", req.headers.origin);
      next();
    });

    // User Registration Route
    app.post("/register", async (req, res) => {
      const { email, password } = req.body;
      const userExists = await userCollection.findOne({ email });

      if (userExists) {
        return res.status(400).send({ message: "User already exists" });
      }

      const newUser = { email, password }; // You should hash passwords in production
      const result = await userCollection.insertOne(newUser);
      res.send({ message: "User registered", result });
    });

    // Login Route
    app.post("/login", async (req, res) => {
      const { email, password } = req.body;
      const user = await userCollection.findOne({ email });

      if (!user || user.password !== password) {
        return res.status(401).send({ message: "Invalid email or password" });
      }

      // Generate JWT Token on successful login
      const token = jwt.sign({ email: user.email }, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // Protected Route (Dashboard)
    app.get("/dashboard", verifyToken, (req, res) => {
      res.send({ message: "Welcome to the dashboard", user: req.user });
    });

    // Create an Order Route
    app.post("/orders", async (req, res) => {
      const data = req.body;
      const result = await orderCollection.insertOne(data);
      res.send(result);
    });

    // Update order with OTP Route
    app.patch("/order-update/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      try {
        const result = await orderCollection.updateOne(
          { _id: new ObjectId(id) }, // Find by ID
          { $set: updatedData } // Set the updated data fields
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Order not found" });
        }

        res.send({ message: "Order updated successfully", result });
      } catch (error) {
        console.error("Error updating order:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // Get All Orders Route
    app.get("/orders", async (req, res) => {
      try {
        const orders = await orderCollection.find({}).toArray();
        res.send(orders);
      } catch (error) {
        res.status(500).send({ message: "Error fetching orders", error });
      }
    });

    // Search Orders by Iqama Number
    app.get("/orders/search", async (req, res) => {
      const { iqama } = req.query; // Get Iqama number from query params
      if (!iqama) {
        return res.status(400).send({ message: "Iqama number is required" });
      }

      const orders = await orderCollection
        .find({ iqamaNumber: iqama })
        .toArray();

      if (orders.length === 0) {
        return res
          .status(404)
          .send({ message: "No orders found for this Iqama number" });
      }

      res.send(orders);
    });

    // Get order by mobile number
    app.get("/orderdPhone/:mobileNumber", async (req, res) => {
      const { mobileNumber } = req.params; // Extract mobileNumber from the request parameters

      try {
        const result = await orderCollection.findOne({ mobile: mobileNumber });

        if (!result) {
          return res
            .status(404)
            .json({ message: "No order found for this mobile number." });
        }

        res.status(200).json(result);
      } catch (error) {
        console.error("Error fetching order:", error);
        res
          .status(500)
          .json({ message: "Server error while fetching the order." });
      }
    });

    // Delete Order by ID Route
    app.delete("/orders/:id", async (req, res) => {
      const { id } = req.params; // Get order ID from URL parameters

      try {
        const result = await orderCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Order not found" });
        }

        res.send({ message: "Order deleted successfully" });
      } catch (error) {
        console.error("Error deleting order:", error);
        res.status(500).send({ message: "Error deleting order", error });
      }
    });

    // Delete Multiple Orders by IDs Route
    app.delete("/deleteOrder/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await orderCollection.deleteOne(query);
      res.send(result);
    });

  } finally {
    // Keep connection open or handle cleanup if necessary
  }
}

run().catch((error) => {
  console.error("Error connecting to MongoDB:", error);
});

app.get("/", (req, res) => {
  res.send("API is running");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
