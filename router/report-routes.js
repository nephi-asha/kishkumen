const express = require('express');
const router = express.Router();
const reportController = require('../controller/report-controller');
const { authorizeRoles } = require('../middleware/auth');

router.get('/profit-loss', authorizeRoles(['Store Owner', 'Admin']), reportController.getProfitLossStatement);

module.exports = router;
