const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const BlastMessage = require("../models/BlastMessage");

const users = {};

async function initWTS(userId) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
    ],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
  );

  await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });
  await page.waitForSelector("canvas", { timeout: 60000 });
  const qrCodeElement = await page.$("canvas");
  const qrDir = path.join(__dirname, "../public/qrcodes");

  if (!fs.existsSync(qrDir)) {
    fs.mkdirSync(qrDir, { recursive: true });
  }

  const qrFilename = `qr-${userId}.png`;
  const qrPath = path.join(qrDir, qrFilename);
  await qrCodeElement?.screenshot({ path: qrPath });

  console.log(`✅ QR code saved at /qrcodes/${qrFilename}`);

  return { browser, page, qrCodeUrl: `/qrcodes/${qrFilename}` };
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

exports.connectUser = async (req, res) => {
  const userId = uuidv4();
  const { browser, page, qrCodeUrl } = await initWTS(userId);

  users[userId] = { userId, status: "connected", browser, page };

  console.log(`✅ Registered user: ${userId}`);
  res.status(201).json({ userId, qrCodeUrl });
};

exports.disconnectUser = async (req, res) => {
  const { userId } = req.body;

  if (!userId || !users[userId]) {
    return res.status(404).json({ error: "User not found or invalid userId" });
  }

  const user = users[userId];
  try {
    if (user.browser && user.browser.process()) {
      await user.browser.close();
      console.log(`🧨 Browser closed for user ${userId}`);
    }

    const qrPath = path.join(__dirname, "../public/qrcodes", `qr-${userId}.png`);
    if (fs.existsSync(qrPath)) {
      fs.unlinkSync(qrPath);
      console.log(`🗑️ Deleted QR code: ${qrPath}`);
    }

    delete users[userId];
    console.log(`🧼 User ${userId} disconnected and cleaned up.`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error(`❌ Failed to disconnect user ${userId}:`, error);
    res.status(500).json({ error: "Failed to disconnect user" });
  }
};

exports.sendMessage = async (req, res) => {
  const { userId, phoneNumbers, message, userEmail, title } = req.body;

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
      await page.waitForSelector('div[contenteditable="true"][data-tab="3"]', { timeout: 10000 });
      await page.focus('div[contenteditable="true"][data-tab="3"]');
      await page.type('div[contenteditable="true"][data-tab="3"]', phoneNumber);
      await delay(1000);
      await page.keyboard.press("Enter");
      await delay(1000);

      await page.waitForSelector('div[contenteditable="true"][data-tab="10"]', { timeout: 30000 });
      await page.focus('div[contenteditable="true"][data-tab="10"]');
      await page.type('div[contenteditable="true"][data-tab="10"]', message);
      await delay(1000);
      await page.keyboard.press("Enter");
      await delay(1000);

      console.log(`✅ Message sent to ${phoneNumber}`);
    } catch (error) {
      console.error("❌ Failed to send message:", error);
      return res.status(500).json({ error: "Failed to send message" });
    }
  }

  const blast = new BlastMessage({ userEmail, scheduled: false, title, content: message, contacts: phoneNumbers });

  try {
    await blast.save();
    console.log("📦 Blast message saved:", title);
  } catch (err) {
    console.error("❌ Failed to save blast message:", err.message);
  }

  res.status(200).json({ success: true });
};

exports.scrapeContacts = async (req, res) => {
  const { userId } = req.body;
  const user = users[userId];
  if (!user || !user.page) return res.status(404).json({ error: "User session not found" });

  const page = user.page;
  const phoneNumbersSet = new Set();

  try {
    await page.goto("https://web.whatsapp.com", { waitUntil: "networkidle2" });
    await page.waitForSelector("div[role='grid']", { timeout: 60000 });
    await page.hover("div[role='grid']");

    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel({ deltaY: 1280 });
      await delay(1000);
      const numbers = await page.$$eval("div[role='grid'] > div", (nodes) => {
        return nodes.map((el) => el.querySelector("[data-id]")?.getAttribute("data-id")?.match(/(\d+)@c\.us/)?.[1]).filter(Boolean);
      });
      numbers.forEach((n) => phoneNumbersSet.add(n));
    }

    res.status(200).json({ phoneNumbers: [...phoneNumbersSet] });
  } catch (error) {
    console.error("❌ Failed to scrape contacts:", error);
    res.status(500).json({ error: "Failed to scrape contacts" });
  }
};
