const express = require('express');
const router = express.Router();
const productsController = require('../controller/products-controller');
const { authorizeRoles } = require('../middleware/auth'); // Import authorizeRoles

// GET all products for the authenticated user's bakery
// Accessible by any authenticated user within a bakery
router.get('/', productsController.getAllProducts);

// GET single product by ID for the authenticated user's bakery
// Accessible by any authenticated user within a bakery
router.get('/:id', productsController.getProductById);

// CREATE new product
// Only Store Owners and Admins can create products
router.post('/', authorizeRoles(['Store Owner', 'Admin']), productsController.createProduct);

// UPDATE product by ID
// Only Store Owners and Admins can update products
router.put('/:id', authorizeRoles(['Store Owner', 'Admin']), productsController.updateProduct);

// DELETE product by ID
// Only Store Owners and Admins can delete products
router.delete('/:id', authorizeRoles(['Store Owner', 'Admin']), productsController.deleteProduct);

module.exports = router;
