const express = require('express');
const router = express.Router();
const productController = require('../controller/product-controller');
const { authorizeRoles } = require('../middleware/auth');

router.get('/', productController.getAllProducts);

router.get('/:id', productController.getProductById);

router.post('/', authorizeRoles(['Store Owner', 'Admin']), productController.createProduct);

router.put('/:id', authorizeRoles(['Store Owner', 'Admin']), productController.updateProduct);

router.delete('/:id', authorizeRoles(['Store Owner', 'Admin']), productController.deleteProduct);

module.exports = router;
