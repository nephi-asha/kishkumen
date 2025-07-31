const express = require('express');
const router = express.Router();
const purchaseRequestController = require('../controller/purchase-request-controller');
const { authorizeRoles } = require('../middleware/auth');

router.get('/', authorizeRoles(['Store Owner', 'Admin', 'Baker']), purchaseRequestController.getAllPurchaseRequests);

// GET single purchase request by ID, including its items
// Accessible by Store Owners, Admins, and Bakers
router.get('/:id', authorizeRoles(['Store Owner', 'Admin', 'Baker']), purchaseRequestController.getPurchaseRequestById);

// CREATE new purchase request
// Accessible by Store Owners, Admins, and Bakers
router.post('/', authorizeRoles(['Store Owner', 'Admin', 'Baker']), purchaseRequestController.createPurchaseRequest);

// UPDATE purchase request by ID
// Accessible by Store Owners, Admins, and Bakers. Status changes restricted to Owner/Admin.
router.put('/:id', authorizeRoles(['Store Owner', 'Admin', 'Baker']), purchaseRequestController.updatePurchaseRequest);

// DELETE purchase request by ID
// Only Store Owners and Admins can delete purchase requests
router.delete('/:id', authorizeRoles(['Store Owner', 'Admin']), purchaseRequestController.deletePurchaseRequest);

module.exports = router;
