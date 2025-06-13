require("dotenv").config();
console.log("[boot] STRIPE_LIVE_WEBHOOK_SECRET =", process.env.STRIPE_LIVE_WEBHOOK_SECRET);
console.log("[boot] STRIPE_TEST_WEBHOOK_SECRET =", process.env.STRIPE_TEST_WEBHOOK_SECRET);
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
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const contactRoutes = require("./routes/contactRoutes");
const blastMessageRoutes = require("./routes/blastMessageRoutes");
const activityRoutes = require("./routes/activityRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const messageComposerRoutes = require("./routes/messageComposerRoutes");
const labelRoutes = require("./routes/labelRoutes");

const connectDB = require("./config/db");
connectDB();
const app = express();

app.use("/stripe/webhook", stripeWebhook);
app.use(express.json());
if (process.env.ENV === "dev") {
  app.use(cors());
}

app.use("/qrcodes", express.static(path.join(__dirname, "public", "qrcodes")));
app.use("/api/labels", labelRoutes);
app.use("/api/stripe", stripeRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/blast-messages", blastMessageRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/message-composer", messageComposerRoutes);

// ------------------ Storage --------------------
const users = {};

// ------------------ Functions ------------------
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

function isValidPhoneNumber(phone) {
  if (typeof phone !== "string") return false;
  const cleaned = phone.replace(/[\s\-().]/g, "");
  const phoneRegex = /^\+?\d{6,15}$/;
  return phoneRegex.test(cleaned);
}

const getAllVisibleContacts = async (page) => {
  // Get all contact elements as ElementHandles
  const allContactElements = await page.$$("div[role='button'][tabindex='-1']");

  // Filter to only visible ones
  const visibleContactElements = [];

  for (const element of allContactElements) {
    // Check if element is visible
    const isVisible = await element.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.top < window.innerHeight;
    });

    if (isVisible) {
      visibleContactElements.push(element);
    } else {
      // Dispose of non-visible elements to free memory
      await element.dispose();
    }
  }

  // Now you have actual ElementHandles you can interact with!
  return visibleContactElements.slice(0, 10); // Limit to 10
};

async function checkAndClosePopup(page) {
  try {
    const popupButtons = await page.$$('div[role="button"], button');

    for (const button of popupButtons) {
      const text = await page.evaluate((el) => el.innerText, button);
      if (["Continue", "OK", "Got it", "Close"].includes(text.trim())) {
        console.log(`⚠️ Popup detected with button: "${text.trim()}". Clicking.`);
        await button.click();
        await delay(1000); // Let the popup close
        return true;
      }
    }

    return false; // No popup found
  } catch (err) {
    console.error("❌ Error checking/closing popup:", err.message);
    return false;
  }
}
// ------------------ puppeteer activities ---------------------
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

  const results = [];
  for (const phoneNumber of phoneNumbers) {
    try {
      await checkAndClosePopup(page);
      /* 1. ── Search contact ─────────────────────────────────────────── */
      const searchBarSelector = 'div[contenteditable="true"][data-tab="3"]';
      await page.waitForSelector(searchBarSelector, { timeout: 10_000 });
      const searchBar = await page.$(searchBarSelector);

      await searchBar.click({ clickCount: 3 });
      await page.keyboard.press("Backspace");
      await searchBar.type(phoneNumber);
      await page.keyboard.press("Enter");
      await delay(1_000);

      // /* 2. ── Grab contact labels ─────────────────────────────────────── */
      // const rawText1 = await page.$eval('div[class="x78zum5"] > span[dir="auto"]', (span) => span.innerText);
      // await page.locator('div[title="Profile details"]').click();
      // await delay(500);
      // const rawText2 = await page.$eval(
      //   'span[dir="auto"] > span[class="x1jchvi3 x1fcty0u x40yjcy"]',
      //   (span) => span.innerText
      // );
      // await page.keyboard.press("Escape"); // close profile pane if opened

      // /* 3. ── Normalise strings for comparison ───────────────────────── */
      // const normalize = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");

      // const text1 = normalize(rawText1);
      // const text2 = normalize(rawText2);
      // const phone = normalize(phoneNumber);

      // const contactMatches = text1.includes(phone) || text2.includes(phone);

      // if (!contactMatches) {
      //   console.log(`⚠️  ${phoneNumber} skipped – message text not found in contact titles`);
      //   results.push({ phone: phoneNumber, status: "skipped", reason: "recipient mismatch" });
      //   continue; // jump to next number
      // }

      /* 4. ── Send message ───────────────────────────────────────────── */
      const inputSelector = 'div[contenteditable="true"][data-tab="10"]';
      await page.waitForSelector(inputSelector, { timeout: 10_000 });
      await page.focus(inputSelector);

      const lines = message.split("\n");
      for (const [idx, line] of lines.entries()) {
        await page.keyboard.type(line);
        if (idx !== lines.length - 1) {
          await page.keyboard.down("Shift");
          await page.keyboard.press("Enter");
          await page.keyboard.up("Shift");
        }
      }
      await page.keyboard.press("Enter");
      await checkAndClosePopup(page);

      console.log(`✅ Sent to ${phoneNumber}`);
      await delay(1000); // wait for message to send
      results.push({ phone: phoneNumber, status: "sent" });
    } catch (err) {
      console.error(`❌ ${phoneNumber} failed:`, err.message);
      await delay(1000); // wait for message to send
      results.push({ phone: phoneNumber, status: "failed", reason: err.message });
      continue; // keep looping
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
    return res.status(500).json({ error: "Failed to save message" });
  }
  const failed = results.filter((r) => r.status === "failed" || r.status === "skipped").length;
  const sent = results.filter((r) => r.status === "sent").length;
  console.log(`results:`, results);
  console.log(`Sent ${sent} | Failed ${failed}`);
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

  console.log(`Checking connection for user ${userId}`);

  try {
    // Search for "(You)" query
    const searchBarSelector = 'div[contenteditable="true"][data-tab="3"]';
    await page.waitForSelector(searchBarSelector, { timeout: 10000 });
    await page.focus(searchBarSelector);
    await page.type(searchBarSelector, "(You)");
    await delay(500);
    await page.keyboard.press("Enter");
    await delay(500);

    // Wait for search results to load
    const searchResultsSelector = 'div[aria-label="Search results."][role="grid"]';
    await page.waitForSelector(searchResultsSelector, { timeout: 10000 });
    await delay(1000);

    // Get all search result items
    const searchResultItems = await page.$$(`${searchResultsSelector} div[role="listitem"]`);
    console.log(`Found ${searchResultItems.length} search result items`);

    let messageYourselfFound = false;

    // Iterate through each search result item
    for (let i = 0; i < searchResultItems.length; i++) {
      try {
        console.log(`Checking search result item ${i + 1}/${searchResultItems.length}`);

        // Click on the search result item
        await searchResultItems[i].click();
        await delay(1000);

        // Check if this chat contains the "Message yourself" span
        const messageYourselfSpan = await page.$('span[title="Message yourself"]');

        if (messageYourselfSpan) {
          // Verify the span text content matches exactly
          const spanText = await page.evaluate((el) => el.textContent, messageYourselfSpan);

          if (spanText === "Message yourself") {
            console.log("✅ Found 'Message yourself' chat!");
            messageYourselfFound = true;

            // Send the confirmation message
            const inputSelector = 'div[contenteditable="true"][data-tab="10"]';
            await page.waitForSelector(inputSelector, { timeout: 10000 });
            await page.focus(inputSelector);
            await page.type(inputSelector, "Connection with Dealmaker is successful ✅");
            await delay(500);
            await page.keyboard.press("Enter");
            await delay(500);

            console.log("✅ Confirmation message sent successfully!");
            break; // Exit the loop as we found and messaged the correct chat
          }
        }

        console.log(`❌ Item ${i + 1} is not the 'Message yourself' chat`);
      } catch (itemError) {
        console.error(`Error processing search result item ${i + 1}:`, itemError);
        continue;
      }
    }

    if (!messageYourselfFound) {
      console.log("❌ 'Message yourself' chat not found in search results");
      return false;
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("❌ Error in findAndMessageYourself:", error);
    return res.status(500);
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

  await page.locator('span[data-icon="new-chat-outline"]').click();
  await page.waitForSelector('div[data-tab="4"]', { timeout: 10000 });
  await page.hover('div[data-tab="4"]');

  const resultSet = new Set(); // store unique contact IDs
  const recentBatches = [];
  const maxRepeats = 3;

  for (let i = 0; i < 100; i++) {
    const visibleContacts = await getAllVisibleContacts(page);
    const currentBatch = [];

    for (const contact of visibleContacts) {
      try {
        const contactId = await contact.evaluate((el) => {
          const nameEl = el.querySelector('span[dir="auto"]');
          return nameEl ? nameEl.textContent?.trim() : `no id`;
        });

        currentBatch.push(contactId);
        if (!resultSet.has(contactId)) {
          resultSet.add(contactId);
          console.log(`✅ Successfully scraped contact: ${contactId}`);
        } else {
          console.log(`⏩ Duplicate skipped: ${contactId}`);
        }
      } catch (contactError) {
        console.log(`❌ Error processing contact: ${contactError.message}`);
        continue;
      }
    }

    // Compare last 5 contacts of current batch
    const last5 = currentBatch.slice(-5).sort();
    if (last5.length === 5) {
      recentBatches.push(last5);
      if (recentBatches.length >= maxRepeats) {
        const [a, b, c] = recentBatches.slice(-3);
        const isRepeated = JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(b) === JSON.stringify(c);
        if (isRepeated) {
          console.log("⚠️ Last 5 contacts repeated 3 times — stopping early.");
          break;
        }
      }
    }

    await page.mouse.wheel({ deltaY: 600 });
    await delay(1000);
  }
  const result = Array.from(resultSet);

  console.log(`\n📊 Final Scraping Summary:`);
  console.log(`📥 Total unique contacts: ${result.length}`);
  console.log(`📋 Scraped contacts:`, JSON.stringify(result, null, 2));

  return res.status(200).json({ phoneNumbers: result });
});
// ------------------ label activities ---------------------

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
