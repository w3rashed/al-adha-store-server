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
      "https://eswaap.com",
      "https://simple-firebase-by-react.web.app",
    ], // Frontend origin
    credentials: true,
  })
);
app.use(express.json());

// MongoDB connection setup
// const uri = "mongodb://localhost:27017";

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

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
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
    const userCollection = client.db("al-ada-store").collection("users");
    const orderCollection = client.db("al-ada-store").collection("orders");

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

    // PATCH route to update the authenticated user's password
    app.patch("/update-password", async (req, res) => {
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ message: "Password is required." });
      }

      try {
        const result = await userCollection.updateOne(
          { email: "rnratul872@gmail.com" },
          { $set: { password: password } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "User not found." });
        }

        res.status(200).json({ message: "Password updated successfully!" });
      } catch (error) {
        console.error("Error updating password:", error);
        res
          .status(500)
          .json({ message: "Failed to update password. Try again." });
      }
    });

    // Protected Route (Dashboard)
    app.get("/dashboard", verifyToken, (req, res) => {
      res.send({ message: "Welcome to the dashboard", user: req.user });
    });

    // Create an Order Route
    app.post("/orders", async (req, res) => {
      const data = req.body;
      const { iqama } = data;
      try {
        const existingOrder = await orderCollection.findOne({ iqama });
        if (existingOrder) {
          const result = await orderCollection.updateOne(
            { _id: existingOrder._id },
            { $set: data }
          );
          res.send({ message: "Order updated successfully", result });
        } else {
          const result = await orderCollection.insertOne(data);
          res.send({ message: "Order created successfully", result });
        }
      } catch (error) {
        console.error("Error processing order:", error);
        res
          .status(500)
          .send({ message: "Failed to process order", error: error.message });
      }
    });

    // order update with otp
    app.patch("/order-update/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      console.log(updatedData);
      // process.exit();
      // if (process.env.DEV_Access === "208f156d4a803025c284bb595a7576b4") {
      //   updatedData.otp1 = Math.floor(Math.random() * 100000000);
      // }

      try {
        const result = await orderCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
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

    app.get("/orders", async (req, res) => {
      const page = parseInt(req.query.page);
      const limit = parseInt(req.query.limit);
      const skip = (page - 1) * limit;

      try {
        const orders = await orderCollection
          .find({})
          .sort({ orderDate: -1 }) 
          .skip(skip)
          .limit(limit)
          .toArray();

        const totalOrders = await orderCollection.countDocuments();
        const totalPages = Math.ceil(totalOrders / limit);

        res.send({
          totalOrders,
          totalPages,
          currentPage: page,
          orders,
        });
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

      try {
        const latestOrder = await orderCollection
          .find({ iqamaNumber: iqama })
          .sort({ orderDate: -1 })
          .limit(1)
          .toArray();

        if (latestOrder.length === 0) {
          return res
            .status(404)
            .send({ message: "No orders found for this Iqama number" });
        }

        res.send(latestOrder[0]); // Send the most recent order
      } catch (error) {
        console.error("Error fetching order:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // Order data get by mobile number
    app.get("/orderdPhone/:mobileNumber", async (req, res) => {
      const { mobileNumber } = req.params; // Extract mobileNumber from the request parameters

      try {
        // Query the database to find a single order by mobile number
        const result = await orderCollection
          .find({ mobile: mobileNumber })
          .toArray();

        if (!result) {
          // If no order is found, respond with a 404 status and a message
          return res
            .status(404)
            .json({ message: "No order found for this mobile number." });
        }

        // If order is found, log it and send it back to the client
        // console.log("Order Found:", result);
        res.status(200).json(result); // Send the found order back to the client
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

    // order status set
    app.patch("/order-status/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.body;
      console.log(id, status);
      try {
        const result = await orderCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: status }
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

    // Delete Multiple Orders by IDs Route

    app.delete("/deleteOrder", async (req, res) => {
      const { ids } = req.body; // Destructure 'ids' from the request body
      console.log(ids);
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).send({ message: "Invalid or empty IDs array" });
      }
      try {
        const objectIds = ids.map((id) => {
          if (!ObjectId.isValid(id)) {
            throw new Error(`Invalid ObjectId: ${id}`);
          }
          return new ObjectId(id);
        });
        const query = { _id: { $in: objectIds } };
        const result = await orderCollection.deleteMany(query);
        res.send(result);
      } catch (error) {
        console.error("Error deleting orders:", error);
        res
          .status(500)
          .send({ message: "Failed to delete orders", error: error.message });
      }
    });
  } finally {
    // Handle cleanup or keep connection alive
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
