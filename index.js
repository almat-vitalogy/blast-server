require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const puppeteer = require("puppeteer");
const { getStream, launch } = require("puppeteer-stream");
const { OpenAI } = require("openai");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();

// app.use(cors());
app.use(express.json());
let browser;
let stream;
let page;

// Add a simple route for health check minor change
app.get("/", (req, res) => {
  res.send("Server is running 1");
});

const delay = (min, max) => {
  // Generate a random delay between min and max milliseconds
  const randomDelay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, randomDelay));
};

async function sendWhatsAppMessage(phoneNumbers, message) {
  for (let phoneNumber of phoneNumbers) {
    await page.waitForSelector('div[contenteditable="true"][data-tab="3"]', { timeout: 30000 });
    await delay(1000, 2000);
    const searchInput = await page.$('div[contenteditable="true"][data-tab="3"]');
    for (const digit of phoneNumber) {
      await searchInput.type(digit);
      await delay(30, 100);
    }
    await delay(500, 1000);
    await page.keyboard.press("Enter");
    await page.waitForSelector('div[contenteditable="true"][data-tab="10"]', { timeout: 30000 });
    await delay(1000, 2000);
    const messageInput = await page.$('div[contenteditable="true"][data-tab="10"]');
    for (const char of message) {
      await messageInput.type(char);
      await delay(30, 100);
    }
    await delay(500, 1000);
    await page.keyboard.press("Enter");
    await delay(500, 1000);
  }
}

async function scrapeWhatsAppPhoneNumbers() {
  await page.waitForSelector("div[role='grid']", { timeout: 60000 });
  await page.hover("div[role='grid']"); // hover on chat list pane

  let phoneNumbersSet = new Set();
  for (let i = 0; i < 20; i++) {
    await page.mouse.wheel({ deltaY: 1280 }); // blast scroll
    await delay(1000, 1500);

    const phoneNumbers = await page.$$eval("div[role='grid'] > div", (nodes) => {
      return nodes
        .map((el) => {
          // Skip groups (groups typically have a group icon)
          const isGroup = !!el.querySelector('span[data-icon="default-group"]') || !!el.querySelector('span[data-icon="default-user-group"]');

          if (isGroup) return null;

          // Try to find the phone number
          // Look for the data-id attribute which often contains the phone number
          const chatDiv = el.querySelector("[data-id]");
          if (chatDiv) {
            const dataId = chatDiv.getAttribute("data-id");
            // Extract phone number from data-id (format is usually something like "1234567890@c.us")
            const match = dataId && dataId.match(/(\d+)@c\.us/);
            return match ? match[1] : null;
          }

          // Alternative approach: Look for specific spans with phone numbers
          const spans = el.querySelectorAll("span");
          for (const span of spans) {
            // Phone numbers are often in the format +xx xxx xxx xxxx or similar
            const text = span.textContent;
            if (/^\+?\d[\d\s-]{8,}$/.test(text)) {
              return text.replace(/\s+/g, ""); // Remove spaces
            }
          }

          return null;
        })
        .filter(Boolean);
    });

    phoneNumbers.forEach((num) => phoneNumbersSet.add(num));
  }

  const allPhoneNumbers = Array.from(phoneNumbersSet);
  console.log("Phone numbers found:", allPhoneNumbers.length);
  console.log(allPhoneNumbers);
  return allPhoneNumbers;
}

app.post("/send-message", async (req, res) => {
  const { phones, message } = req.body;
  if (!phones.length || !message) {
    return res.status(400).send("Phone numbers and message are required.");
  }
  try {
    await sendWhatsAppMessage(phones, message);
    res.status(200).send("Message sent successfully.");
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Failed to send message.");
  }
});

app.get("/scrape-contacts", async (req, res) => {
  try {
    const contacts = await scrapeWhatsAppPhoneNumbers();
    res.status(200).json({ contacts });
  } catch (err) {
    console.error("Scrape error:", err);
    res.status(500).send("Failed to scrape contacts.");
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

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    // origin: "*",
    // methods: "*",
  },
  // path: "/socket.io",
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.on("connection", (socket) => {
  console.log("Frontend connected:", socket.id);

  socket.on("start-stream", async ({ url }) => {
    console.log("Starting Puppeteer stream:", url);

    try {
      browser = await launch({
        headless: false,
        executablePath: puppeteer.executablePath(),
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--single-process",
          "--disable-gpu",
        ],
        env: {
          ...process.env,
          DISPLAY: ":99", // <== force Puppeteer to use the virtual display
        },
      });

      page = await browser.newPage();
      await page.goto(url);

      stream = await getStream(page, {
        audio: false, // no audio to reduce complexity
        video: true,
        mimeType: "video/webm; codecs=vp8",
        videoBitsPerSecond: 2000000, // lower bitrate (2 Mbps) improves stability significantly
        frameSize: 200, // larger frame size = fewer chunks per second, but more stable and less CPU-intensive
        videoConstraints: {
          mandatory: {
            minWidth: 1024,
            minHeight: 576,
            maxWidth: 1024,
            maxHeight: 576,
            maxFrameRate: 30, // lower FPS greatly improves stability
            minFrameRate: 25,
          },
        },
      });

      stream.on("data", (chunk) => {
        socket.emit("video-stream", chunk);
      });

      stream.on("error", async (err) => {
        console.error("Stream error:", err);
        if (browser) {
          await browser.close();
          browser = null;
        }
        socket.emit("stream-ended");
      });

      stream.on("end", async () => {
        console.log("Stream ended normally");
        if (browser) {
          await browser.close();
          browser = null;
        }
        socket.emit("stream-ended");
      });
    } catch (error) {
      console.error("Error starting browser:", error);
      socket.emit("stream-error", { message: error.message });
    }
  });

  socket.on("disconnect", async () => {
    console.log("Frontend disconnected:", socket.id);
    console.log("Stream ended abnormally");
    if (browser) {
      await browser.close();
      browser = null;
    }
  });
});

// Use the PORT environment variable that Render provides
const PORT = process.env.PORT || 5001;
server
  .listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  })
  .on("error", (err) => {
    console.error("Server error:", err);
  });
