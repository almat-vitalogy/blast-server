require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const BlastMessage = require("./models/BlastMessage");

const stripeRoutes = require("./routes/stripeRoutes");
const stripeWebhook = require("./routes/stripeWebhook");
const contactRoutes = require("./routes/contactRoutes");
const blastMessageRoutes = require("./routes/blastMessageRoutes");
const activityRoutes = require("./routes/activityRoutes");
// const whatsappRoutes = require("./routes/whatsappRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const messageComposerRoutes = require("./routes/messageComposerRoutes");

// Database connection
const connectDB = require("./config/db");
connectDB();

// Initialize App
const app = express();

// --- 1) Stripe Webhook route must come BEFORE body-parsing middleware ---
app.use('/stripe/webhook', stripeWebhook);
// -----------------------------------------------------------------------

// Then we can apply normal middlewares
app.use(express.json());
app.use(cors()); // allow cross-origin requests
app.use("/qrcodes", express.static(path.join(__dirname, "public", "qrcodes")));

app.use("/api/stripe", stripeRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/blast-messages", blastMessageRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/dashboard", dashboardRoutes);
// app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/message-composer", messageComposerRoutes);

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
app.get("/", (req, res) => res.send("deal maker server is running developement"));

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

const PORT = process.env.PORT || 5004;
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
