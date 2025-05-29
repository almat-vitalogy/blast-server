const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

exports.generateMessage = async (req, res) => {
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

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a WhatsApp messaging assistant specifically designed for insurance agents in Hong Kong, adept at creating casual, engaging, and human-like WhatsApp communications following specific formatting rules.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    });

    const message = completion.choices[0].message.content; // ✅ fix: define message first
    console.log("📨 AI Generated message:", message);
    res.json({ message });
  } catch (error) {
    console.error("❌ Error generating AI message:", error);
    res.status(500).send("Failed to generate message.");
  }
};