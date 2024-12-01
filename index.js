// cSpell:disable
const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 4000;

// middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ruowzmj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const userCollection = client.db("mediquixDB").collection("users");
    const campCollection = client.db("mediquixDB").collection("camps");
    const joinCampCollection = client.db("mediquixDB").collection("joinCamps");
    const feedbackCollection = client.db("mediquixDB").collection("feedbacks");

    // JWT related APIs
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.Access_Token_Secret, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // middleware
    const verifyToken = (req, res, next) => {
      // console.log("inside verify token", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Unauthorized Access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      // console.log('checking token',token);
      const secret = process.env.Access_Token_Secret;
      // console.log('checking secret',secret);
      jwt.verify(token, secret, (err, decoded) => {
        if (err) {
          // console.error("Token verification error:", err);
          return res.status(401).send({ message: "Unauthorized Access" });
        }
        // console.log("Decoded token:", decoded);
        req.decoded = decoded;
        next();
      });
    };

    // verify admin after verify token
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = {email: email};
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role ==='Admin';
      // console.log(isAdmin);
      if (!isAdmin) {
        return res.status(403).send({message:'Forbidden Access'})
      }
      next();
    }

    // Feedback related api
    // add a camp
    app.post("/feedbacks", verifyToken, async (req, res) => {
      const feedback = req.body;
      // console.log(feedback);
      const result = await feedbackCollection.insertOne(feedback);
      res.send(result);
    });

    app.get("/feedbacks", async (req, res) => {
      const result = await feedbackCollection.find().toArray();
      res.send(result);
    });

    // camp related api
    // add a camp
    app.post("/camps", verifyToken, verifyAdmin, async (req, res) => {
      const camp = req.body;
      // console.log(camp);
      const result = await campCollection.insertOne(camp);
      res.send(result);
    });

    // delete a camp
    app.delete("/delete-camp/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await campCollection.deleteOne(query);
      res.send(result);
    });

    // Update a camp by ID
    app.patch("/update-camp/:campId",  verifyToken, verifyAdmin, async (req, res) => {
      const campId = req.params.campId;
      const updatedCamp = req.body;
      const query = { _id: new ObjectId(campId) };
      const update = { $set: updatedCamp };
      const result = await campCollection.updateOne(query, update);
      res.send(result);
    });

    // get all camp collection
    app.get("/camps", async (req, res) => {
      const result = await campCollection.find().toArray();
      res.send(result);
    });

    // get individual camp by id
    app.get("/camps/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await campCollection.findOne(query);
      res.send(result);
    });

    // Join a camp
    app.post("/joinCamps", verifyToken, async (req, res) => {
      const joinedCamp = req.body;
      const campName = joinedCamp.campName;

      try {
        const result = await joinCampCollection.insertOne(joinedCamp);

        const campResult = await campCollection.updateOne(
          { campName: campName },
          { $inc: { participantCount: 1 } }
        );

        res.send(result);
      } catch (error) {
        // console.error("Error joining camp:", error);
        res.status(500).send({ message: "Error joining camp", error });
      }
    });

    app.get("/joinCamps", verifyToken, async (req, res) => {
      const result = await joinCampCollection.find().toArray();
      res.send(result);
    });

    app.get("/joinCamps/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await joinCampCollection.findOne(query);
      res.send(result);
    });

    // Join camp query by email and campName
    app.get("/joinedCamps", async (req, res) => {
      let query = {};
      if (req.query?.email) {
        query = { email: req.query.email };
      }
      const result = await joinCampCollection.find(query).toArray();
      res.send(result);
    });

    // Delete a camp by ID from joined camp collection
    app.delete("/joinedCamps/:id",  verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      try {
        const result = await joinCampCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        // console.error("Error deleting camp:", error);
        res.status(500).send({ message: "Failed to delete camp", error });
      }
    });

    // Update payment status by ID
    app.patch("/joinedCamps/payment/:id",  verifyToken, async (req, res) => {
      const id = req.params.id;
      const paymentStatus = req.body.paymentStatus;
      const query = { _id: new ObjectId(id) };
      const update = { $set: { paymentStatus: paymentStatus } };

      try {
        const result = await joinCampCollection.updateOne(query, update);
        res.send(result);
      } catch (error) {
        // console.error("Error updating payment status:", error);
        res
          .status(500)
          .send({ message: "Failed to update payment status", error });
      }
    });

    // update feedback status in registred camp
    app.patch("/joinedCamps/feedback/:id",  verifyToken, async (req, res) => {
      const id = req.params.id;
      const { feedbackStatus } = req.body;
      const query = { _id: new ObjectId(id) };
      const update = { $set: { feedbackStatus: feedbackStatus } };

      try {
        const result = await joinCampCollection.updateOne(query, update);
        res.send(result);
      } catch (error) {
        // console.error("Error updating feedback status:", error);
        res
          .status(500)
          .send({ message: "Failed to update feedback status", error });
      }
    });

    // Update individual camp payment and confirmation status by ID
    app.patch("/joinCamps/:id",  verifyToken, async (req, res) => {
      const id = req.params.id;
      const {
        paymentStatus,
        confirmationStatus,
        transactionId,
        campName,
        campFees,
      } = req.body;

      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          ...(paymentStatus && { paymentStatus }),
          ...(confirmationStatus && { confirmationStatus }),
          ...(transactionId && { transactionId }),
          ...(campName && { campName }),
          ...(campFees && { campFees }),
        },
      };

      try {
        const result = await joinCampCollection.updateOne(query, update);
        res.send(result);
      } catch (error) {
        // console.error("Error updating camp:", error);
        res.status(500).send({ message: "Failed to update camp", error });
      }
    });

    // user related API

    // Add a user
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        const query = { email: user.email };
        const existingUser = await userCollection.findOne(query);
        if (existingUser) {
          return res.send({ message: "User already exists", insertedId: null });
        }
        const result = await userCollection.insertOne(user);
        res.send(result);
      } catch (error) {
        // console.error("Error inserting user:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.patch("/users/role/:id",verifyToken, async (req, res) => {
      const id = req.params.id;
      const user = await userCollection.findOne({ _id: new ObjectId(id) });
      const newRole = user.role === "Admin" ? "Participant" : "Admin";
      const updateDoc = { $set: { role: newRole } };

      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        updateDoc
      );
      res.send({ result, newRole });
    });

    app.get("/users", async (req, res) => {
      const cursor = userCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/user", async (req, res) => {
      const email = req.query.email;
      const user = await userCollection.findOne({ email: email });
      res.send(user);
    });

    app.patch("/user", verifyToken, async (req, res) => {
      const email = req.query.email;
      const updatedData = req.body;
      const result = await userCollection.updateOne(
        { email: email },
        { $set: updatedData }
      );
      res.send(result);
    });

    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // verify admin
    app.get("/users/admin/:email",  verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let isAdmin = false;
      if (user?.role === "Admin") {
        isAdmin = true;
      } else {
        isAdmin = false;
      }
      res.send({ isAdmin });
    });

    // payment intent
    app.post("/create-payment-intent",  verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      // console.log(amount);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("This is MediQuix server");
});

app.listen(port, () => {
  console.log(`MediQuix server is running on port ${port}`);
});
