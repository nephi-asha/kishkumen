const express = require('express');
const router = express.Router();
const restocksController = require('../controller/restocks-controller');
const { authorizeRoles } = require('../middleware/auth');


// GET all restocks for the authenticated user's bakery
// Accessible by any authenticated user within a bakery
router.get('/', restocksController.getAllRestockRequests);

// CREATE new restock
// Only Store Owners, Admins, and Bakers can create restocks
router.post('/', authorizeRoles(['Store Owner', 'Admin', 'Baker']), restocksController.createRestockRequest);

module.exports = router;