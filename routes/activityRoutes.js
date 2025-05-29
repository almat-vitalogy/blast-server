const express = require("express");
const router = express.Router();
const activityController = require("../controllers/activityController");

router.get("/:userEmail", activityController.getActivities);
router.post("/update", activityController.updateActivity);

module.exports = router;
