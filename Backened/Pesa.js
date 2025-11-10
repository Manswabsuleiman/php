require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");
const { connectDB, PesapalToken } = require("./DatabasePesapal");

const app = express();

// ----------------------
// CORS Configuration
// ----------------------
const allowedOrigins = [
  "http://localhost:5173",
  "https://action-b5fj.onrender.com",
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// ----------------------
// Pesapal LIVE Credentials
// ----------------------
const PESAPAL_CONSUMER_KEY = process.env.PESAPAL_CONSUMER_KEY;
const PESAPAL_CONSUMER_SECRET = process.env.PESAPAL_CONSUMER_SECRET;
const BASE_URL = "https://pay.pesapal.com/v3/api";

// ----------------------
// URLs
// ----------------------
const LIVE_IPN_URL = "https://java-lypp.onrender.com/api/pesapal/ipn";
const LIVE_BROWSER_REDIRECT_URL = "https://action-b5fj.onrender.com/payment-callback";

// ----------------------
// Get Access Token (DB-backed)
// ----------------------
async function getAccessToken() {
  try {
    let tokenDoc = await PesapalToken.findOne({}).sort({ expiresAt: -1 });

    const now = new Date();
    if (tokenDoc && tokenDoc.expiresAt > now) {
      console.log("✅ Using existing DB token");
      return tokenDoc.accessToken;
    }

    const response = await axios.post(
      `${BASE_URL}/Auth/RequestToken`,
      {
        consumer_key: PESAPAL_CONSUMER_KEY,
        consumer_secret: PESAPAL_CONSUMER_SECRET,
      },
      { headers: { "Content-Type": "application/json" } }
    );

    if (!response.data?.token) throw new Error("No token returned from Pesapal");

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 55);

    if (tokenDoc) {
      tokenDoc.accessToken = response.data.token;
      tokenDoc.expiresAt = expiresAt;
      await tokenDoc.save();
    } else {
      await PesapalToken.create({
        accessToken: response.data.token,
        expiresAt,
      });
    }

    console.log("🔄 New Pesapal token stored in DB");
    return response.data.token;
  } catch (err) {
    console.error("❌ Error getting access token:", err.response?.data || err.message);
    throw err;
  }
}

// ----------------------
// Route: Submit Order Request
// ----------------------
app.post("/api/pesapal/order", async (req, res) => {
  try {
    const { amount, email, phone, firstName, lastName } = req.body || {};

    if (!amount || isNaN(amount) || Number(amount) < 0.01) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment amount. Must be 0.01 or higher.",
      });
    }

    if (!email || !phone || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: "Missing customer details",
      });
    }

    const accessToken = await getAccessToken();

    const orderId = crypto.randomUUID();
    const orderData = {
      id: orderId,
      currency: "KES",
      amount: Number(parseFloat(amount).toFixed(2)),
      description: "Movie Ticket Payment",
      callback_url: LIVE_BROWSER_REDIRECT_URL,
      notification_id: crypto.randomUUID(),
      billing_address: {
        email_address: email,
        phone_number: phone,
        country_code: "KE",
        first_name: firstName,
        last_name: lastName,
      },
    };

    console.log("📤 Sending order data:", orderData);

    const response = await axios.post(
      `${BASE_URL}/Transactions/SubmitOrderRequest`,
      orderData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Pesapal Order Created:", response.data);

    res.status(200).json({
      success: true,
      redirect_url: response.data.redirect_url,
      order_tracking_id: response.data.order_tracking_id,
    });
  } catch (err) {
    console.error("❌ Payment Error:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: err.response?.data?.message || "Payment initiation failed",
      details: err.response?.data || err.message,
    });
  }
});

// ----------------------
// Route: IPN Handler
// ----------------------
app.post("/api/pesapal/ipn", (req, res) => {
  console.log("📩 IPN received:", req.body);
  res.status(200).json({ message: "IPN received successfully" });
});

// ----------------------
// Connect to MongoDB and Start Server
// ----------------------
const PORT = process.env.PORT || 8000;
connectDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
});
