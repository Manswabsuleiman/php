const mongoose = require("mongoose");

// ----------------------
// Pesapal Token Schema
// ----------------------
const tokenSchema = new mongoose.Schema({
  accessToken: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  notificationId: { type: String }, // optional
});

const PesapalToken = mongoose.model("PesapalToken", tokenSchema);

// ----------------------
// MongoDB Connection
// ----------------------
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
}

module.exports = { connectDB, PesapalToken };


