const express = require('express');
const router = express.Router();
const salesController = require('../controller/sales-controller');
const { authorizeRoles } = require('../middleware/auth');

// GET all sales for the authenticated user's bakery
// Accessible by any authenticated user within a bakery
router.get('/', salesController.getAllSales);

// GET single sale by ID, including its items
// Accessible by any authenticated user within a bakery
router.get('/:id', salesController.getSaleById);

// CREATE new sale
// Only Store Owners, Admins, and Cashiers can create sales
router.post('/', authorizeRoles(['Store Owner', 'Admin', 'Cashier']), salesController.createSale);

// UPDATE sale by ID
// Only Store Owners and Admins can update sales
router.put('/:id', authorizeRoles(['Store Owner', 'Admin']), salesController.updateSale);

// DELETE sale by ID
// Only Store Owners and Admins can delete sales
router.delete('/:id', authorizeRoles(['Store Owner', 'Admin']), salesController.deleteSale);

module.exports = router;
