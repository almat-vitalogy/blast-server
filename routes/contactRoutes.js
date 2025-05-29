const express = require("express");
const router = express.Router();
const contactController = require("../controllers/contactController");

router.get("/:userEmail", contactController.getContacts);
router.post("/add/:userEmail", contactController.addContact);
router.delete("/delete/:userEmail/:phone", contactController.deleteContact);

module.exports = router;
