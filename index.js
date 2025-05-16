require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const puppeteer = require("puppeteer");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const Contact = require("./models/Contact");
const BlastMessage = require("./models/BlastMessage"); // keep it 
const { v4: uuidv4 } = require("uuid");
const { OpenAI } = require("openai");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const app = express();
app.use(express.json());
app.use(cors()); // allow cross-origin requests
app.use("/qrcodes", express.static(path.join(__dirname, "public", "qrcodes")));


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


// ====================================================== 1. Mongo DB: fetch data for: dashboard, blast-dashboard, activity-feed ========================================================
const MONGODB_URI = "mongodb+srv://jasmine:xxbjyP0RMNrOf2eS@dealmaker.hbhznd5.mongodb.net/?retryWrites=true&w=majority&appName=dealmaker";

mongoose
  .connect(MONGODB_URI, { dbName: "dealmaker" })
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ✅ Dashboard API
app.get("/api/dashboard", async (req, res) => {
  try {
    console.log("🚩 Fetching Dashboard Data...");
    
    // Fetch recent blasts from BlastMessage collection
    const recentBlasts = await BlastMessage.find({ status: { $ne: "System" } })
      .sort({ date: -1 })
      .limit(5)
      .select('title sent delivered failed date status');

    // Fetch recent activities from BlastMessage collection
    const recentActivitiesRaw = await BlastMessage.find({}).sort({ "activity.timestamp": -1 }).limit(5);
    
    const recentActivity = recentActivitiesRaw.map(item => ({
      icon: item.activity.icon,
      description: item.activity.description,
      timestamp: item.activity.timestamp,
    }));

    const data = {
      totalContacts: 1250,
      messagesSent: 1234,
      scheduledBlasts: 45678,
      successRate: 4.5,
      recentBlasts,
      recentActivity,
    };

    console.log("✅ Dashboard Data:", data);
    res.json(data);
  } catch (err) {
    console.error("❌ Error fetching Dashboard data:", err);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

// 🚩 Blast Dashboard (Blast messages only, simplified) 
app.get("/api/blast-dashboard", async (req, res) => {
  try {
    const data = await BlastMessage.find({ status: { $ne: "System" } })
      .sort({ date: -1 }).limit(20)
      .select("title sent delivered failed date status");
      
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch blast dashboard data" });
  }
});

// ✅ Add Activity Feed item (New API for adding items individually) 
app.get("/api/activity-feed", async (req, res) => {
  try {
    const data = await BlastMessage.find({})
      .sort({ date: -1 })
      .limit(20);
    console.log("✅ Blast Messages fetched:", data);
    res.json(data);
  } catch (err) {
    console.error("❌ Error fetching blast messages:", err);
    res.status(500).json({ error: "Failed to fetch blast messages" });
  }
});

// ====================================================== 2. Mongo DB: [Contact CRUD Routes]: add-contacts, delete-contacts ========================================================
app.post("/api/add-contacts", async (req, res) => {
  const { phone, name } = req.body;

  if (!phone) return res.status(400).json({ error: "Phone is required" });

  try {
    const newContact = new Contact({ phone, name: name || phone });
    await newContact.save();
    console.log(`✅ Contact added: ${phone}`);
    res.status(201).json(newContact);
  } catch (err) {
    console.error("❌ Error adding contact:", err);
    res.status(500).json({ error: "Failed to add contact" });
  }
});

// 🚩 Delete a Contact by phone
app.delete("/api/delete-contacts/:phone", async (req, res) => {
  const { phone } = req.params;

  try {
    const deleted = await Contact.findOneAndDelete({ phone });
    if (!deleted) return res.status(404).json({ error: "Contact not found" });

    console.log(`🗑️ Contact deleted: ${phone}`);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ Error deleting contact:", err);
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

app.get("/api/get-contacts", async (req, res) => {
  try {
    const contacts = await Contact.find({});
    res.json(contacts);
  } catch (err) {
    console.error("❌ Error fetching contacts:", err);
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

// ======================================================Mongo DB========================================================
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
      await page.waitForSelector(inputSelector, { timeout: 30000 });

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
  const { goal } = req.body;
  if (!goal) return res.status(400).send("Message goal is required.");

  const prompt = `
  You are an assistant specialized in generating engaging, personalized WhatsApp messages specifically for insurance agents.  

  The agent needs a WhatsApp message for the following purpose/theme: "${goal}"

  Common insurance-agent message themes include:

  •⁠  ⁠Birthday greetings for clients  
  •⁠  ⁠General or festival greetings (e.g., holidays, seasonal wishes)  
  •⁠  ⁠Insurance policy status notifications  
  •⁠  ⁠Informational updates on insurance products  
  •⁠  ⁠Responses to client inquiries regarding their policy or insurance products

  Craft a clear, concise, and friendly message that sounds professional, human-like, and genuine.  
  •⁠  ⁠*Use WhatsApp formatting (bold, italics)* thoughtfully to highlight important information or greetings when appropriate.  
  •⁠  ⁠Ensure the message is engaging and approachable.  
  •⁠  ⁠Avoid robotic language or overly formal tones; maintain warmth and sincerity.
  `;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a professional WhatsApp messaging assistant specifically tailored for insurance agents, skilled at crafting concise, engaging, and friendly client communications using WhatsApp formatting.",
        },
        {
          role: "user",
          content: prompt,
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
