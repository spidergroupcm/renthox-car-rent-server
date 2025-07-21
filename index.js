require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const app = express();
const port = process.env.PORT || 5000;

// CORS setup
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://renthox.web.app",
  ],
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// MongoDB setup
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.03fi3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// JWT middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).send({ message: "unauthorized access" });
  jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
    if (err) return res.status(401).send({ message: "unauthorized access" });
    req.user = decoded;
    next();
  });
};

async function run() {
  try {
    const db = client.db("car-db");
    const carCollections = db.collection("cars");
    const bookingCollections = db.collection("booking");

    // JWT issue
    app.post("/jwt", async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.SECRET_KEY, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
        })
        .send({ success: true });
    });

    // Logout
    app.get("/logout", async (req, res) => {
      res
        .clearCookie("token", {
          maxAge: 0,
          httpOnly: true,
          secure: true,
          sameSite: "none",
        })
        .send({ success: true });
    });

    // Add a new car
    app.post("/add-car", async (req, res) => {
      const result = await carCollections.insertOne(req.body);
      res.send(result);
    });

    // Get cars with search and sort
    app.get("/cars", async (req, res) => {
      const { search = "", sortBy, order = "asc" } = req.query;
      const sortOrder = order === "desc" ? -1 : 1;
      const query = { carModel: { $regex: new RegExp(search), $options: "i" } };
      const sortOptions = sortBy ? { [sortBy]: sortOrder } : {};
      const result = await carCollections.find(query).sort(sortOptions).toArray();
      res.send(result);
    });

    // Get limited cars
    app.get("/cars/limit", async (req, res) => {
      const result = await carCollections.find().limit(6).toArray();
      res.send(result);
    });

    // Get cars by user
    app.get("/myCars", async (req, res) => {
      const { email, sortBy, order = "asc" } = req.query;
      const sortOrder = order === "desc" ? -1 : 1;
      const sortOptions = sortBy ? { [sortBy]: sortOrder } : {};
      const result = await carCollections.find({ email }).sort(sortOptions).toArray();
      res.send(result);
    });

    // Delete car
    app.delete("/cars/:id", async (req, res) => {
      const result = await carCollections.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });

    // Get car by ID
    app.get("/car/:id", async (req, res) => {
      const result = await carCollections.findOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });

    // Update car
    app.put("/updateCars/:id", async (req, res) => {
      const updated = { $set: req.body };
      const result = await carCollections.updateOne(
        { _id: new ObjectId(req.params.id) },
        updated,
        { upsert: true }
      );
      res.send(result);
    });

    // Book a car
    app.post("/addBooking", async (req, res) => {
      const bookData = req.body;
      const exists = await bookingCollections.findOne({
        email: bookData.email,
        carId: bookData.carId,
      });
      if (exists) return res.status(400).send("You have already booking car");

      const result = await bookingCollections.insertOne(bookData);

      // Increment booking count
      await carCollections.updateOne(
        { _id: new ObjectId(bookData.carId) },
        { $inc: { bookingCount: 1 } }
      );

      res.send(result);
    });

    // Get bookings for user (with token verification)
    app.get("/books/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.user?.email !== email)
        return res.status(401).send({ message: "unauthorized access" });

      const result = await bookingCollections.find({ userEmail: email }).toArray();
      res.send(result);
    });

    // Cancel booking
    app.patch("/books/:id", async (req, res) => {
      const result = await bookingCollections.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { status: "Canceled" } }
      );
      res.send(result);
    });

    // Update booking dates
    app.patch("/books/dates/:id", async (req, res) => {
      const { startDate, endDate } = req.body;
      const result = await bookingCollections.updateOne(
        { _id: new ObjectId(req.params.id) },
        {
          $set: {
            startDate,
            endDate,
            status: "Confirmed",
          },
        }
      );
      res.send(result);
    });

    console.log("Pinged your deployment. You successfully connected to MongoDB");
  } finally {
    // Optional: keep MongoDB client open for Vercel cold start performance
  }
}

run().catch(console.dir);

// Root route
app.get("/", (req, res) => {
  res.send("Car rental server is running");
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});


