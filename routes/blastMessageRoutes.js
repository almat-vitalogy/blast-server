const express = require("express");
const router = express.Router();
const blastMessageController = require("../controllers/blastMessageController");

router.get("/:userEmail", blastMessageController.getBlastMessages);

module.exports = router;
