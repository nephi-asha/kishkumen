const express = require('express');
const router = express.Router();
const opayController = require('../controller/opay-controller');


router.post('/payment-notification', opayController.handleOpayCallback);

module.exports = router;
