const express = require("express");
const router = express.Router();
const whatsappController = require("../controllers/whatsappController");

router.post("/connect-user", whatsappController.connectUser);
router.post("/disconnect-user", whatsappController.disconnectUser);
router.post("/send-message", whatsappController.sendMessage);
router.post("/scrape-contacts", whatsappController.scrapeContacts);

module.exports = router;
