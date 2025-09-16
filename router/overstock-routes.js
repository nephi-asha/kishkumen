const express = require('express');
const router = express.Router();
const overStockController = require('../controller/overstocks-controller');
const { authorizeRoles } = require('../middleware/auth');

router.get('/', overStockController.getOverStockData);

module.exports = router;
