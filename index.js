require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const puppeteer = require("puppeteer");
const mongoose = require("mongoose");
const Dashboard = require("./models/Dashboard");
const BlastDashboard = require("./models/BlastDashboard");
const ActivityFeed = require("./models/ActivityFeed");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
app.use(express.json());
app.use(cors()); // allow cross-origin requests
app.use("/qrcodes", express.static(path.join(__dirname, "public", "qrcodes")));

const MONGODB_URI = "mongodb+srv://jasmine:xxbjyP0RMNrOf2eS@dealmaker.hbhznd5.mongodb.net/?retryWrites=true&w=majority&appName=dealmaker";

mongoose
  .connect(MONGODB_URI, { dbName: "dealmaker" })
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ------------------ Storage --------------------
const users = {};

// ------------------ Functions ------------------
async function initWTS(userId) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-accelerated-2d-canvas", "--disable-gpu"],
  });

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36");

  // Get the QR code
  await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });
  await page.waitForSelector("canvas", { timeout: 60000 });
  const qrCodeElement = await page.$("canvas");
  const qrDir = path.join(__dirname, "public", "qrcodes");
  if (!fs.existsSync(qrDir)) {
    fs.mkdirSync(qrDir, { recursive: true });
  }

  const qrFilename = `qr-${userId}.png`;
  const qrPath = path.join(qrDir, qrFilename);
  await qrCodeElement?.screenshot({ path: qrPath });

  console.log(`✅ QR code saved at /qrcodes/${qrFilename}`);

  return {
    browser,
    page,
    qrCodeUrl: `/qrcodes/${qrFilename}`, // ⬅️ Return this to the frontend
  };
}

// ------------------ Routes ---------------------
app.get("/", (req, res) => res.send("Server is running 1"));

app.get("/api/dashboard", async (req, res) => {
  try {
    console.log("🚩 Fetching Dashboard Data...");
    const data = await Dashboard.findOne({});
    console.log("✅ Dashboard Data:", data);
    res.json(data);
  } catch (err) {
    console.error("❌ Error fetching Dashboard data:", err);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

app.get("/api/blast-dashboard", async (req, res) => {
  try {
    console.log("🚩 Fetching Blast Dashboard Data...");
    const data = await BlastDashboard.find().sort({ _id: -1 }).limit(20);
    console.log("✅ Blast Dashboard Data:", data);
    res.json(data);
  } catch (err) {
    console.error("❌ Error fetching Blast Dashboard data:", err);
    res.status(500).json({ error: "Failed to fetch blast dashboard data" });
  }
});

app.get("/api/activity-feed", async (req, res) => {
  try {
    console.log("🚩 Fetching Activity Feed Data...");
    const data = await ActivityFeed.find().sort({ _id: -1 }).limit(20);
    console.log("✅ Activity Feed Data:", data);
    res.json(data);
  } catch (err) {
    console.error("❌ Error fetching Activity Feed data:", err);
    res.status(500).json({ error: "Failed to fetch activity feed data" });
  }
});

app.post("/api/activity-feed", async (req, res) => {
  const { icon, title, description, timestamp } = req.body;
  if (!icon || !title || !description || !timestamp) {
    return res.status(400).json({ error: "All fields required." });
  }

  try {
    const newActivity = new ActivityFeed({ icon, title, description, timestamp });
    await newActivity.save();
    res.status(201).json(newActivity);
  } catch (err) {
    console.error("❌ Error adding activity feed item:", err);
    res.status(500).json({ error: "Failed to add activity feed item" });
  }
});

app.post("/api/activity-feed", async (req, res) => {
  const { icon, title, description, timestamp } = req.body;
  if (!icon || !title || !description || !timestamp) {
    return res.status(400).json({ error: "All fields required." });
  }

  try {
    const newActivity = new ActivityFeed({ icon, title, description, timestamp });
    await newActivity.save();
    res.status(201).json(newActivity);
  } catch (err) {
    console.error("❌ Error adding activity feed item:", err);
    res.status(500).json({ error: "Failed to add activity feed item" });
  }
});

app.post("/connect-user", async (req, res) => {
  const userId = uuidv4();
  const { browser, page, qrCodeUrl } = await initWTS(userId);

  users[userId] = {
    userId,
    status: "connected",
    browser,
    page,
  };

  console.log(`✅ Registered user: ${userId}`);
  return res.status(201).json({ userId, qrCodeUrl });
});

app.post("/disconnect-user", async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  const user = users[userId];

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  try {
    // Close the Puppeteer browser
    if (user.browser && user.browser.process()) {
      await user.browser.close();
      console.log(`🧨 Browser closed for user ${userId}`);
    }

    // Delete QR code file
    const qrPath = path.join(__dirname, "public", "qrcodes", `qr-${userId}.png`);
    if (fs.existsSync(qrPath)) {
      fs.unlinkSync(qrPath);
      console.log(`🗑️ Deleted QR code: ${qrPath}`);
    }

    // Remove user from memory
    delete users[userId];
    console.log(`🧼 User ${userId} disconnected and cleaned up.`);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error(`❌ Failed to disconnect user ${userId}:`, error);
    return res.status(500).json({ error: "Failed to disconnect user" });
  }
});

app.post("/send-message", async (req, res) => {
  const { userId, phoneNumbers, message } = req.body;

  if (!userId || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0 || !message) {
    return res.status(400).json({ error: "Missing or invalid required fields" });
  }

  const user = users[userId];

  if (!user || !user.page) {
    return res.status(404).json({ error: "User session not found" });
  }

  const page = user.page;

  for (const phoneNumber of phoneNumbers) {
    try {
      // Step 1: Go to chat
      const chatUrl = `https://web.whatsapp.com/send?phone=${phoneNumber}`;
      await page.goto(chatUrl, { waitUntil: "networkidle2" });

      // Step 2: Wait for chat input
      const inputSelector = 'div[contenteditable="true"][data-tab="10"]';
      await page.waitForSelector(inputSelector, { timeout: 10000 });

      // Step 3: Focus input and type message
      await page.focus(inputSelector);
      await page.type(inputSelector, message);
      await page.keyboard.press("Enter");

      console.log(`✅ Message sent to ${phoneNumber}: ${message}`);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("❌ Failed to send message:", error);
      return res.status(500).json({ error: "Failed to send message" });
    }
  }
});

app.post("/message-composer/generate", async (req, res) => {
  const { goal, clientName, policyType, expiryDate } = req.body;
  if (!goal) return res.status(400).send("Message goal is required.");

  const prompt = `
  You are an assistant helping AIA insurance agents craft personalized client messages.
  Please generate a professional and friendly WhatsApp message based on the following:
  
  - Goal: ${goal}
  ${clientName ? `- Client Name: ${clientName}` : ""}
  ${policyType ? `- Policy Type: ${policyType}` : ""}
  ${expiryDate ? `- Expiry Date: ${expiryDate}` : ""}
  
  The message should be polite, clear, and encourage client engagement. Avoid sounding robotic.
  `;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a professional message assistant for AIA insurance agents. Your job is to generate polite, clear, and helpful client messages for WhatsApp or SMS, based on the agent's goal.",
        },
        {
          role: "user",
          content: `Goal: ${prompt}`,
        },
      ],
      temperature: 0.7,
    });

    const message = completion.choices[0].message.content;
    console.log("📨 AI Generated message:", message);
    res.json({ message });
  } catch (error) {
    console.error("❌ Error generating AI message:", error);
    res.status(500).send("Failed to generate message.");
  }
});

const PORT = process.env.PORT || 5001;
http
  .createServer(app)
  .listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  })
  .on("error", (err) => {
    console.error("Server error:", err);
  });

process.on("SIGINT", async () => {
  console.log("\n🧹 Gracefully shutting down...");

  for (const userId in users) {
    const user = users[userId];
    try {
      if (user.browser && user.browser.process()) {
        console.log(`Closing browser for user ${userId}`);
        await user.browser.close();
        delete users[userId];
      }
    } catch (err) {
      console.error(`Error closing browser for ${userId}:`, err);
    }
  }

  const qrDir = path.join(__dirname, "public", "qrcodes");
  if (fs.existsSync(qrDir)) {
    const files = fs.readdirSync(qrDir);
    for (const file of files) {
      const filePath = path.join(qrDir, file);
      try {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Deleted: ${file}`);
      } catch (err) {
        console.error(`⚠️ Failed to delete ${file}:`, err);
      }
    }
  }

  console.log("✅ Cleanup complete. Exiting.");
  process.exit(0);
});
