const express = require("express");
const router = express.Router();
const { generateMessage } = require("../controllers/messageComposerController");

router.post("/generate", generateMessage);

module.exports = router;
