require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const puppeteer = require("puppeteer");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const Agent = require("./models/Agents");
const Contact = require("./models/Contact");
const BlastMessage = require("./models/BlastMessage");
const Activity = require("./models/Activity");
const { v4: uuidv4 } = require("uuid");
const { OpenAI } = require("openai");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const app = express();
app.use(express.json());
// app.use(cors()); // allow cross-origin requests
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

  await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });

  // Get and save QR code
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
    qrCodeUrl: `/qrcodes/${qrFilename}`,
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ------------------ Routes ---------------------
app.get("/", (req, res) => res.send("deal maker server is running"));

// ====================================================== Mongo DB starts: fetch data for: dashboard, blast-dashboard, activity-feed ========================================================
const MONGODB_URI = "mongodb+srv://jasmine:xxbjyP0RMNrOf2eS@dealmaker.hbhznd5.mongodb.net/?retryWrites=true&w=majority&appName=dealmaker";

mongoose
  .connect(MONGODB_URI, { dbName: "dealmaker" })
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ================================================================================== 🚩 1. Dynamic Dashboard (Agent-specific) ==================================================================================

// 🚩 Updated Dashboard Route (Dynamic, agent-specific)

app.get("/api/dashboard/:userEmail", async (req, res) => {
  const { userEmail } = req.params;

  try {
    const contacts = await Contact.find({ userEmail });
    const blastMessages = await BlastMessage.find({ userEmail }).sort({ createdAt: -1 });
    const activities = await Activity.find({ userEmail }).sort({ updatedAt: -1 });

    const recentBlasts = blastMessages.slice(0, 5);
    const recentActivity = activities.slice(0, 5).map((activity) => ({
      icon: mapActionToIcon(activity.action),
      description: activity.action,
      timestamp: activity.updatedAt,
    }));

    const totalDelivered = blastMessages.reduce((sum, blast) => sum + blast.delivered, 0);
    const totalSent = blastMessages.reduce((sum, blast) => sum + blast.sent, 0);
    const successRate = totalSent ? ((totalDelivered / totalSent) * 100).toFixed(2) : 0;

    res.json({
      totalContacts: contacts.length,
      contacts,
      successRate: parseFloat(successRate),
      recentBlasts,
      recentActivity,
      blastMessages,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

// Helper function to map actions to icons
function mapActionToIcon(action) {
  const iconMapping = {
    "contacts scraped": "CheckCircle2",
    "contact added": "PlusCircle",
    "contact deleted": "XCircle",
    "blast created": "MessageSquare",
    "blast sent": "CheckCircle",
    "session connected": "RefreshCcw",
    "session disconnected": "XCircle",
    "message composed": "MessageCircle",
    error: "XCircle",
  };

  return iconMapping[action] || "Clock";
}

app.get("/api/contacts/:userEmail", async (req, res) => {
  try {
    const contacts = await Contact.find({ userEmail: req.params.userEmail });
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

// Get Blast Messages by userEmail
app.get("/api/blast-messages/:userEmail", async (req, res) => {
  try {
    const blasts = await BlastMessage.find({ userEmail: req.params.userEmail }).sort({ createdAt: -1 });
    res.json(blasts);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch blast messages" });
  }
});

// Get Activities by userEmail
app.get("/api/activities/:userEmail", async (req, res) => {
  try {
    const activities = await Activity.find({ userEmail: req.params.userEmail }).sort({ updatedAt: -1 });
    res.json(activities);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch activities" });
  }
});

// ====================================================== 2. Mongo DB: [Contact CRUD Routes]: add-contacts, delete-contacts ========================================================

app.post("/api/add-contact/:userEmail", async (req, res) => {
  const { userEmail } = req.params;
  const { name, phone } = req.body;
  console.log(`data: ${userEmail}, ${name}, ${phone}`);

  try {
    console.log("trying to add contact");
    const contact = new Contact({ userEmail, name, phone });
    const forntendContact = { name, phone };
    console.log("contact created:", forntendContact);
    await contact.save();
    res.status(201).json({ success: true, forntendContact });
  } catch (err) {
    console.error("Error saving contact:", err);
    res.status(500).json({ error: "Failed to add contact" });
  }
});

app.delete("/api/delete-contact/:userEmail/:phone", async (req, res) => {
  const { userEmail, phone } = req.params;

  try {
    const deleted = await Contact.findOneAndDelete({ userEmail, phone });
    if (!deleted) return res.status(404).json({ error: "Contact not found" });
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

app.get("/api/get-contacts/:userEmail", async (req, res) => {
  const { userEmail } = req.params;
  try {
    const contacts = await Contact.find({ userEmail });
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

app.post("/api/update-activity", async (req, res) => {
  const { userEmail, action } = req.body;

  if (!userEmail || !action) {
    return res.status(400).json({ error: "Missing userEmail or action" });
  }

  try {
    const activity = new Activity({
      userEmail,
      action,
      updatedAt: new Date(), // optional, Mongoose can handle this automatically if your schema supports it
    });

    await activity.save();
    console.log(`📘 Activity logged: ${action} for ${userEmail}`);
    res.status(201).json({ success: true });
  } catch (err) {
    console.error("❌ Failed to save activity:", err);
    res.status(500).json({ error: "Failed to save activity" });
  }
});

// ====================================================== Mongo DB end ========================================================
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
  const { userId, phoneNumbers, message, userEmail, title } = req.body;

  if (!userId || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0 || !message) {
    return res.status(400).json({ error: "Missing or invalid required fields" });
  }

  const user = users[userId];

  if (!user || !user.page) {
    return res.status(404).json({ error: "User session not found" });
  }

  const page = user.page;
  console.log("Sending message with data:", {
    userId,
    phoneNumbers,
    message,
    userEmail,
    title,
  });
  // const whatsappUrl = "https://web.whatsapp.com";
  // await page.goto(whatsappUrl, { waitUntil: "networkidle2" });
  for (const phoneNumber of phoneNumbers) {
    try {
      // Step 1: select searchbar and search for the contact
      await page.waitForSelector('div[contenteditable="true"][data-tab="3"]', { timeout: 10000 });
      const searchBarSelector = 'div[contenteditable="true"][data-tab="3"]';
      await page.focus(searchBarSelector);
      await page.type(searchBarSelector, phoneNumber);
      await delay(1000); // Wait for search results to load
      await page.keyboard.press("Enter");
      await delay(1000); // Wait for chat to load

      // Step 2: Wait for chat input
      const inputSelector = 'div[contenteditable="true"][data-tab="10"]';
      await page.waitForSelector(inputSelector, { timeout: 30000 });

      // Step 3: Focus input and type message
      await page.focus(inputSelector);
      await page.type(inputSelector, message);
      await delay(1000); // Ensure message is typed
      await page.keyboard.press("Enter");
      await delay(1000); // Wait for message to send

      console.log(`✅ Message sent to ${phoneNumber}: ${message}`);
    } catch (error) {
      console.error("❌ Failed to send message:", error);
      return res.status(500).json({ error: "Failed to send message" });
    }
  }

  try {
    const blast = new BlastMessage({
      userEmail,
      scheduled: false,
      title: title,
      content: message,
      contacts: phoneNumbers,
    });

    await blast.save();
    console.log("📦 Blast message saved:", title);
  } catch (err) {
    console.error("❌ Failed to save blast message:", err.message);
  }

  return res.status(200).json({ success: true });
});

app.post("/check-connection", async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  const user = users[userId];
  if (!user || !user.page) {
    return res.status(404).json({ error: "User session not found" });
  }

  const page = user.page;

  try {
    console.log(`🔍 Checking connection for user: ${userId}`);

    // Step 1: Click profile button using Puppeteer extended XPath selector
    const profileBtn = await page.waitForSelector('::-p-xpath(//*[@id="app"]/div/div[3]/div/header/div/div/div/div/span/div/div[2]/div[2]/button)', {
      timeout: 10000,
    });
    await profileBtn.click();
    await delay(1000); // Let profile screen load

    // Step 2: Extract 'Your name' using XPath selector
    const nameSpan = await page.waitForSelector(
      '::-p-xpath(//*[@id="app"]/div/div[3]/div/div[2]/div[1]/span/div/div/span/div/div/div[2]/div[2]/div/div/span/span)',
      { timeout: 10000 }
    );
    const name = await page.evaluate((el) => el.textContent, nameSpan);
    if (!name) throw new Error("❌ Failed to extract name content");
    console.log(`📛 Extracted name: ${name}`);

    // Step 3: Return to chats by clicking the Chats button via XPath
    const chatsBtn = await page.waitForSelector('::-p-xpath(//*[@id="app"]/div/div[3]/div/header/div/div/div/div/span/div/div[1]/div[1]/button)', {
      timeout: 10000,
    });
    await chatsBtn.click();
    await delay(1000);

    // Step 4: Use the search bar to find yourself
    const searchBarSelector = 'div[contenteditable="true"][data-tab="3"]';
    await page.waitForSelector(searchBarSelector, { timeout: 10000 });
    await page.focus(searchBarSelector);
    await page.click(searchBarSelector, { clickCount: 3 });
    await page.type(searchBarSelector, name);
    await delay(1000);
    await page.keyboard.press("Enter");
    await delay(1000);

    // Step 5: Type and send confirmation message
    const inputSelector = 'div[contenteditable="true"][data-tab="10"]';
    await page.waitForSelector(inputSelector, { timeout: 30000 });
    await page.focus(inputSelector);

    const message = "Connection with Dealmaker is successful ✅";
    await page.type(inputSelector, message);
    await delay(1000);
    await page.keyboard.press("Enter");
    await delay(1000);

    console.log(`✅ Confirmation message sent to yourself (${name})`);
    return res.status(200).json({ success: true, selfName: name });
  } catch (error) {
    console.error("❌ Failed during check-connection:", error);
    return res.status(500).json({ error: "Failed to complete check-connection flow" });
  }
});

app.post("/scrape-contacts", async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  const user = users[userId];
  if (!user || !user.page) {
    return res.status(404).json({ error: "User session not found" });
  }

  const page = user.page;

  try {
    await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });
    await page.waitForSelector("div[role='grid']", { timeout: 60000 });
    await page.hover("div[role='grid']");

    const phoneNumbersSet = new Set();

    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel({ deltaY: 1280 });
      await delay(1000);

      const numbers = await page.$$eval("div[role='grid'] > div", (nodes) => {
        const result = [];

        nodes.forEach((el) => {
          const isGroup = !!el.querySelector('span[data-icon="default-group"]') || !!el.querySelector('span[data-icon="default-user-group"]');
          if (isGroup) return;

          const chatDiv = el.querySelector("[data-id]");
          if (chatDiv) {
            const dataId = chatDiv.getAttribute("data-id");
            const match = dataId && dataId.match(/(\d+)@c\.us/);
            if (match) {
              result.push(match[1]);
              return;
            }
          }

          const spans = el.querySelectorAll("span");
          for (const span of spans) {
            const text = span.textContent;
            if (/^\+?\d[\d\s-]{8,}$/.test(text)) {
              result.push(text.replace(/\s+/g, ""));
              return;
            }
          }
        });

        return result;
      });

      numbers.forEach((n) => phoneNumbersSet.add(n));
    }

    const phoneNumbers = Array.from(phoneNumbersSet);
    console.log(`📥 Scraped ${phoneNumbers.length} phone numbers`);
    res.status(200).json({ phoneNumbers });
  } catch (error) {
    console.error("❌ Failed to scrape contacts:", error);
    res.status(500).json({ error: "Failed to scrape contacts" });
  }
});

app.post("/message-composer/generate", async (req, res) => {
  const { goal } = req.body;
  if (!goal) return res.status(400).send("Message goal is required.");

  const prompt = `
  You are a WhatsApp messaging assistant specialized in crafting engaging, natural, and friendly messages. The messages should feel personal, genuine, and conversational, as if chatting casually with a good friend or a trusted acquaintance.

  The agent needs a WhatsApp message for the following purpose or theme: "${goal}".

  Create a message that is:
  • Concise, clear, warm, and polite.
  • Naturally conversational and culturally appropriate for Hong Kong recipients.
  • Professionally friendly, avoiding overly formal, robotic, or overly casual phrases like "Hey there", "嘿！", or generic western greetings.

  Use WhatsApp formatting consistently:
  • *Bold* for important emphasis
  • _Italic_ for subtle emphasis or quotes
  • ~Cross out~ for humorous corrections or playful tones

  Do NOT include generic greetings like "Best regards" or closing signatures. Simply deliver a friendly, warm, chat-like message without unnecessary fluff.

  Output the entire message as a single line with no line breaks or newlines.
  `;
  // const prompt = `
  // You are a WhatsApp messaging assistant specialized in crafting engaging, natural, and friendly messages specifically tailored for insurance agents based in Hong Kong. The messages should feel personal, genuine, and conversational, as if chatting casually with a good friend or a trusted acquaintance.

  // The agent needs a WhatsApp message for the following purpose or theme: "${goal}".

  // Common WhatsApp messaging themes for insurance agents include:

  // • Birthday greetings for clients
  // • General or festive greetings (holidays, festivals, seasonal wishes)
  // • Insurance policy status updates
  // • Informational messages about new insurance products
  // • Friendly check-ins or follow-ups

  // Create a message that is:
  // • Concise, clear, warm, and polite.
  // • Naturally conversational and culturally appropriate for Hong Kong recipients.
  // • Professionally friendly, avoiding overly formal, robotic, or overly casual phrases like "Hey there", "嘿！", or generic western greetings.

  // Use WhatsApp formatting consistently:
  // • *Bold* for important emphasis
  // • _Italic_ for subtle emphasis or quotes
  // • ~Cross out~ for humorous corrections or playful tones

  // Do NOT include generic greetings like "Best regards" or closing signatures. Simply deliver a friendly, warm, chat-like message without unnecessary fluff.
  // `;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a WhatsApp messaging assistant specifically designed for insurance agents in Hong Kong, adept at creating casual, engaging, and human-like WhatsApp communications following specific formatting rules.",
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

const PORT = process.env.PORT || 5002;
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
