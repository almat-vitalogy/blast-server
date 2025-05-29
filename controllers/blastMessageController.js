const BlastMessage = require("../models/BlastMessage");

exports.getBlastMessages = async (req, res) => {
  try {
    const blasts = await BlastMessage.find({ userEmail: req.params.userEmail }).sort({ createdAt: -1 });
    res.json(blasts);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch blast messages" });
  }
};
