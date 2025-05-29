const Contact = require("../models/Contact");
const BlastMessage = require("../models/BlastMessage");
const Activity = require("../models/Activity");

// 🚩 Updated Dashboard Route (Dynamic, agent-specific)
exports.getDashboard = async (req, res) => {
  console.log("attempting to fetch dashboard data for user:", req.params.userEmail);
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
};

// Helper function inside controller file
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
