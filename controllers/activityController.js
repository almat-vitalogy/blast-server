const Activity = require("../models/Activity");

exports.getActivities = async (req, res) => {
  try {
    const activities = await Activity.find({ userEmail: req.params.userEmail }).sort({ updatedAt: -1 });
    res.json(activities);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch activities" });
  }
};

exports.updateActivity = async (req, res) => {
  const { userEmail, action } = req.body;

  try {
    const activity = new Activity({ userEmail, action, updatedAt: new Date() });
    await activity.save();
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to save activity" });
  }
};
