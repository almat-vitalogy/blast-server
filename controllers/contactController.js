const Contact = require("../models/Contact");

exports.getContacts = async (req, res) => {
  try {
    const contacts = await Contact.find({ userEmail: req.params.userEmail });
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
};

exports.addContact = async (req, res) => {
  const { userEmail } = req.params;
  const { name, phone } = req.body;

  try {
    const contact = new Contact({ userEmail, name, phone });
    await contact.save();
    res.status(201).json({ success: true, contact });
  } catch (err) {
    console.error("Server error on adding contact:", err); 
    res.status(500).json({ error: "Failed to add contact", details: err.message });
  }
};

exports.deleteContact = async (req, res) => {
  const { userEmail, phone } = req.params;

  try {
    const deleted = await Contact.findOneAndDelete({ userEmail, phone });
    if (!deleted) return res.status(404).json({ error: "Contact not found" });
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete contact" });
  }
};
