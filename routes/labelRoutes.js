// server/routes/labelRoutes.js
const express = require("express");
const router = express.Router();

const Label = require("../models/Label"); // <- Label.js we built earlier
const Contact = require("../models/Contact"); // assume you already have this

/* -----------------------------------------------------------
 * POST /api/labels/create-label
 * { name, color?, userEmail }
 * --------------------------------------------------------- */
router.post("/create-label", async (req, res) => {
  try {
    const { name, color = "#3b82f6", userEmail } = req.body;
    if (!name || !userEmail) return res.status(400).json({ error: "name and userEmail are required" });

    // protect unique (name + userEmail) instead of global unique if you like
    const dup = await Label.findOne({ name, userEmail });
    if (dup) return res.status(409).json({ error: "Label already exists" });

    const label = await Label.create({ name, color, userEmail, contactIds: [] });
    return res.status(201).json(label);
  } catch (err) {
    console.error("create-label:", err);
    return res.status(500).json({ error: "Server error creating label" });
  }
});

/* -----------------------------------------------------------
 * DELETE /api/labels/delete-label/:labelId
 * --------------------------------------------------------- */
router.delete("/delete-label/:labelId", async (req, res) => {
  try {
    const { labelId } = req.params;

    const label = await Label.findById(labelId);
    if (!label) return res.status(404).json({ error: "Label not found" });

    // 1) pull this label from all contacts in one shot
    await Contact.updateMany({ _id: { $in: label.contactIds } }, { $pull: { labelIds: labelId } });

    // 2) remove the label itself
    await label.deleteOne();

    return res.json({ success: true });
  } catch (err) {
    console.error("delete-label:", err);
    return res.status(500).json({ error: "Server error deleting label" });
  }
});

/* -----------------------------------------------------------
 * POST /api/labels/toggle-label
 * { contactId, labelId }
 * --------------------------------------------------------- */
router.post("/toggle-label", async (req, res) => {
  console.log("toggle-label:", req.body);
  try {
    let { contactId, labelId } = req.body;
    if (!contactId || !labelId) return res.status(400).json({ error: "contactId and labelId required" });

    const contact = await Contact.findById(contactId);
    const label = await Label.findById(labelId);
    if (!contact || !label) return res.status(404).json({ error: "Contact or label not found" });

    const hasIt = contact.labels.includes(labelId);

    // atomic twin-update using $addToSet / $pull
    await Promise.all([
      Contact.updateOne(
        { _id: contactId },
        hasIt ? { $pull: { labels: labelId } } : { $addToSet: { labels: labelId } }
      ),
      Label.updateOne(
        { _id: labelId },
        hasIt ? { $pull: { contactIds: contactId } } : { $addToSet: { contactIds: contactId } }
      ),
    ]);

    return res.status(200).json({ success: true, mode: hasIt ? "detached" : "attached" });
  } catch (err) {
    console.error("toggle-label:", err);
    return res.status(500).json({ error: "Server error toggling label" });
  }
});

/* -----------------------------------------------------------
 * GET /api/labels/get-labels?userEmail=foo@bar.com
 * --------------------------------------------------------- */
router.get("/get-labels", async (req, res) => {
  try {
    const { userEmail } = req.query;
    if (!userEmail) return res.status(400).json({ error: "userEmail is required" });

    const labels = await Label.find({ userEmail }).sort({ createdAt: 1 });
    return res.json(labels);
  } catch (err) {
    console.error("get-labels:", err);
    return res.status(500).json({ error: "Server error fetching labels" });
  }
});

/* -----------------------------------------------------------
 * POST /api/labels/mass-assign-label
 * { contactIds: string[], labelId, userEmail }
 * --------------------------------------------------------- */
router.post("/mass-assign-label", async (req, res) => {
  try {
    const { contactIds, labelId, userEmail } = req.body;
    if (!Array.isArray(contactIds) || contactIds.length === 0 || !labelId)
      return res.status(400).json({ error: "contactIds[] and labelId are required" });

    // ensure label exists & belongs to the user
    const label = await Label.findOne({ _id: labelId, userEmail });
    if (!label) return res.status(404).json({ error: "Label not found" });

    /* 1) add the label to each contact (skip if already present) */
    const { modifiedCount } = await Contact.updateMany(
      { _id: { $in: contactIds }, userEmail },
      { $addToSet: { labels: labelId } }
    );

    /* 2) add the contacts to label.contactIds */
    await Label.updateOne({ _id: labelId }, { $addToSet: { contactIds: { $each: contactIds } } });

    return res.json({ success: true, affected: modifiedCount });
  } catch (err) {
    console.error("mass-assign-label:", err);
    return res.status(500).json({ error: "Server error mass-assigning label" });
  }
});

/* -----------------------------------------------------------
 * POST /api/labels/mass-deassign-label
 * { contactIds: string[], labelId, userEmail }
 * --------------------------------------------------------- */
router.post("/mass-deassign-label", async (req, res) => {
  try {
    const { contactIds, labelId, userEmail } = req.body;
    if (!Array.isArray(contactIds) || contactIds.length === 0 || !labelId)
      return res.status(400).json({ error: "contactIds[] and labelId are required" });

    // ensure label exists & belongs to the user
    const label = await Label.findOne({ _id: labelId, userEmail });
    if (!label) return res.status(404).json({ error: "Label not found" });

    /* 1) pull the label from the listed contacts */
    const { modifiedCount } = await Contact.updateMany(
      { _id: { $in: contactIds }, userEmail },
      { $pull: { labels: labelId } }
    );

    /* 2) pull those contacts from label.contactIds */
    await Label.updateOne({ _id: labelId }, { $pull: { contactIds: { $in: contactIds } } });

    return res.json({ success: true, affected: modifiedCount });
  } catch (err) {
    console.error("mass-deassign-label:", err);
    return res.status(500).json({ error: "Server error mass-deassigning label" });
  }
});

module.exports = router;
