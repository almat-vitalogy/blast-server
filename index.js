require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const puppeteer = require("puppeteer");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const Agent = require("./models/Agents");
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ------------------ Routes ---------------------
app.get("/", (req, res) => res.send("Server is running 1"));

// ====================================================== Mongo DB starts: fetch data for: dashboard, blast-dashboard, activity-feed ========================================================
const MONGODB_URI = "mongodb+srv://jasmine:xxbjyP0RMNrOf2eS@dealmaker.hbhznd5.mongodb.net/?retryWrites=true&w=majority&appName=dealmaker";

mongoose
  .connect(MONGODB_URI, { dbName: "dealmaker" })
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ================================================================================== 🚩 1. Dynamic Dashboard (Agent-specific) ================================================================================== 

// 🚩 Updated Dashboard Route (Dynamic, agent-specific)
app.get("/api/dashboard/:agentPhone", async (req, res) => {
  const { agentPhone } = req.params;

  try {
    const agent = await Agent.findOne({ phone: agentPhone });

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    const recentBlasts = agent.blastMessages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

    const recentActivity = agent.activities
      .sort((a, b) => new Date(b.datetime) - new Date(a.datetime))
      .slice(0, 5)
      .map((activity) => ({
        icon: mapActionToIcon(activity.action),
        description: activity.action,
        timestamp: new Date(activity.datetime).toISOString(),
      }));

    const totalDelivered = agent.blastMessages.reduce((sum, blast) => sum + blast.delivered, 0);
    const totalSent = agent.blastMessages.reduce((sum, blast) => sum + blast.sent, 0);
    const successRate = totalSent ? ((totalDelivered / totalSent) * 100).toFixed(2) : 0;

    const dashboardData = {
      totalContacts: agent.contacts.length,
      contacts: agent.contacts, 
      successRate: parseFloat(successRate),
      recentBlasts,
      recentActivity,
      blastMessages: agent.blastMessages,
    };

    res.json(dashboardData);
  } catch (err) {
    console.error("❌ Error fetching Dashboard data:", err);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

// Helper function to map actions to icons
function mapActionToIcon(action) {
  const iconMapping = {
    "contacts scraped": "CheckCircle2",
    "contact added": "PlusCircle",
    "blast created": "MessageSquare",
    "blast sent": "CheckCircle",
    "session connected": "RefreshCcw",
    "session disconnected": "XCircle",
    error: "XCircle",
  };

  return iconMapping[action] || "Clock";
}


// 🚩 Seed Agent Route
// const { DateTime } = require('luxon');
// app.post("/api/seed-agent", async (req, res) => {
//   const hongKongTime = (isoString) => DateTime.fromISO(isoString, { zone: 'Asia/Hong_Kong' }).toJSDate();

//   const agentData = {
//     phone: "85268712802",
//     password: "turoid123",
//     contacts: [
//       { name: "Jane Chan", phone: "85298765432", labels: ["VIP", "New"], createdAt: hongKongTime("2025-05-19T10:33:25") },
//       { name: "John Doe", phone: "85212345678", labels: ["Regular"], createdAt: hongKongTime("2025-05-19T10:33:25") },
//       { name: "Alice Wong", phone: "85291234567", labels: ["Regular", "Loyal"], createdAt: hongKongTime("2025-05-18T09:22:00") },
//       { name: "Bob Lee", phone: "85298761234", labels: ["VIP"], createdAt: hongKongTime("2025-05-17T14:15:00") }
//     ],
//     blastMessages: [
//       {
//         scheduled: false,
//         title: "🎉 Birthday Promo",
//         sent: 120,
//         delivered: 115,
//         failed: 5,
//         scheduledAt: hongKongTime("2025-04-29T23:00:00"),
//         createdAt: hongKongTime("2025-04-29T20:00:00"),
//         content: "Happy Birthday!",
//         status: "Completed"
//       },
//       {
//         scheduled: true,
//         title: "📢 Promo Alert",
//         sent: 150,
//         delivered: 147,
//         failed: 3,
//         scheduledAt: hongKongTime("2025-05-01T18:00:00"),
//         createdAt: hongKongTime("2025-04-30T12:00:00"),
//         content: "Special discount available!",
//         status: "Scheduled"
//       },
//       {
//         scheduled: false,
//         title: "💬 Follow-up Message",
//         sent: 98,
//         delivered: 97,
//         failed: 1,
//         scheduledAt: hongKongTime("2025-04-28T02:30:00"),
//         createdAt: hongKongTime("2025-04-28T01:00:00"),
//         content: "Reminder about your appointment.",
//         status: "Completed"
//       }
//     ],
//     activities: [
//       {
//         action: "contacts scraped",
//         datetime: hongKongTime("2025-05-18T23:00:00")
//       },
//       {
//         action: "contact added",
//         datetime: hongKongTime("2025-05-19T18:45:00")
//       },
//       {
//         action: "blast created",
//         datetime: hongKongTime("2025-05-17T13:00:00")
//       },
//       {
//         action: "blast sent",
//         datetime: hongKongTime("2025-05-01T18:01:00")
//       },
//       {
//         action: "session connected",
//         datetime: hongKongTime("2025-05-20T09:00:00")
//       }
//     ]
//   };

//   try {
//     const agent = new Agent(agentData);
//     await agent.save();
//     res.status(201).json(agent);
//   } catch (error) {
//     console.error("❌ Error seeding agent data:", error);
//     res.status(500).json({ error: "Failed to seed agent data" });
//   }
// });


// ====================================================== 2. Mongo DB: [Contact CRUD Routes]: add-contacts, delete-contacts ========================================================
// app.post("/api/add-contacts", async (req, res) => {
//   const { phone, name } = req.body;

//   if (!phone) return res.status(400).json({ error: "Phone is required" });

//   try {
//     const newContact = new Contact({ phone, name: name || phone });
//     await newContact.save();
//     console.log(`✅ Contact added: ${phone}`);
//     res.status(201).json(newContact);
//   } catch (err) {
//     console.error("❌ Error adding contact:", err);
//     res.status(500).json({ error: "Failed to add contact" });
//   }
// });

// // 🚩 Delete a Contact by phone
// app.delete("/api/delete-contacts/:phone", async (req, res) => {
//   const { phone } = req.params;

//   try {
//     const deleted = await Contact.findOneAndDelete({ phone });
//     if (!deleted) return res.status(404).json({ error: "Contact not found" });

//     console.log(`🗑️ Contact deleted: ${phone}`);
//     res.status(200).json({ success: true });
//   } catch (err) {
//     console.error("❌ Error deleting contact:", err);
//     res.status(500).json({ error: "Failed to delete contact" });
//   }
// });

// Add a Contact to the agent's contact list
app.post("/api/add-contact/:agentPhone", async (req, res) => {
  const { agentPhone } = req.params;
  const { name, phone } = req.body;

  try {
    const agent = await Agent.findOne({ phone: agentPhone });
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    agent.contacts.push({ name, phone, createdAt: new Date() });
    await agent.save();

    res.status(201).json({ success: true, contact: { name, phone } });
  } catch (err) {
    console.error("❌ Error adding contact:", err);
    res.status(500).json({ error: "Failed to add contact" });
  }
});

// Delete a Contact by phone number from the agent's contact list
app.delete("/api/delete-contact/:agentPhone/:phone", async (req, res) => {
  const { agentPhone, phone } = req.params;

  try {
    const agent = await Agent.findOne({ phone: agentPhone });
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const initialLength = agent.contacts.length;
    agent.contacts = agent.contacts.filter((c) => c.phone !== phone);

    if (agent.contacts.length === initialLength)
      return res.status(404).json({ error: "Contact not found" });

    await agent.save();
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
      // Step 1: Go to WTS
      const whatsappUrl = "https://web.whatsapp.com";
      await page.goto(whatsappUrl, { waitUntil: "networkidle2" });

      await page.waitForSelector('div[contenteditable="true"][data-tab="3"]', { timeout: 10000 });
      const searchBarSelector = 'div[contenteditable="true"][data-tab="3"]';
      await page.focus(searchBarSelector);
      await page.type(searchBarSelector, phoneNumber);
      await page.keyboard.press("Enter");

      // Step 2: Wait for chat input
      const inputSelector = 'div[contenteditable="true"][data-tab="10"]';
      await page.waitForSelector(inputSelector, { timeout: 30000 });

      // Step 3: Focus input and type message
      await page.focus(inputSelector);
      await page.type(inputSelector, message);
      await page.keyboard.press("Enter");

      console.log(`✅ Message sent to ${phoneNumber}: ${message}`);
    } catch (error) {
      console.error("❌ Failed to send message:", error);
      return res.status(500).json({ error: "Failed to send message" });
    }
  }
  return res.status(200).json({ success: true });
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
  You are a WhatsApp messaging assistant specialized in crafting engaging, natural, and friendly messages specifically tailored for insurance agents based in Hong Kong. The messages should feel personal, genuine, and conversational, as if chatting casually with a good friend or a trusted acquaintance.

  The agent needs a WhatsApp message for the following purpose or theme: "${goal}".

  Common WhatsApp messaging themes for insurance agents include:

  • Birthday greetings for clients
  • General or festive greetings (holidays, festivals, seasonal wishes)
  • Insurance policy status updates
  • Informational messages about new insurance products
  • Friendly check-ins or follow-ups

  Create a message that is:
  • Concise, clear, warm, and polite.
  • Naturally conversational and culturally appropriate for Hong Kong recipients.
  • Professionally friendly, avoiding overly formal, robotic, or overly casual phrases like "Hey there", "嘿！", or generic western greetings.

  Use WhatsApp formatting consistently:
  • *Bold* for important emphasis
  • _Italic_ for subtle emphasis or quotes
  • ~Cross out~ for humorous corrections or playful tones

  Do NOT include generic greetings like "Best regards" or closing signatures. Simply deliver a friendly, warm, chat-like message without unnecessary fluff.
  `;

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



// app.post("/blast-create", async (req, res) => {
//   const now = new Date(8 *60 * 60 * 1000).now();
//   new Blast({title, content, now})

//   new Activity({actino, now})
// })

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
