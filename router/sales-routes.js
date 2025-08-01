const express = require('express');
const router = express.Router();
const salesController = require('../controller/sales-controller');
const { authorizeRoles } = require('../middleware/auth');

router.get('/', salesController.getAllSales);

router.get('/:id', salesController.getSaleById);

router.post('/', authorizeRoles(['Store Owner', 'Admin', 'Cashier']), salesController.createSale);

router.put('/:id', authorizeRoles(['Store Owner', 'Admin']), salesController.updateSale);

router.delete('/:id', authorizeRoles(['Store Owner', 'Admin']), salesController.deleteSale);

module.exports = router;
