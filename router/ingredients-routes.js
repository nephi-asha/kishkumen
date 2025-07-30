const express = require('express');
const router = express.Router();
const ingredientController = require('../controller/ingredient-controller');
const { authorizeRoles } = require('../middleware/auth'); 

// GET all ingredients for the authenticated user's bakery
// Accessible by any authenticated user within a bakery
router.get('/', ingredientController.getAllIngredients);

// GET single ingredient by ID for the authenticated user's bakery
// Accessible by any authenticated user within a bakery
router.get('/:id', ingredientController.getIngredientById);

// CREATE new ingredient
// Only Store Owners, Admins, and Bakers can create ingredients
router.post('/', authorizeRoles(['Store Owner', 'Admin', 'Baker']), ingredientController.createIngredient);

// UPDATE ingredient by ID
// Only Store Owners, Admins, and Bakers can update ingredients
router.put('/:id', authorizeRoles(['Store Owner', 'Admin', 'Baker']), ingredientController.updateIngredient);

// DELETE ingredient by ID
// Only Store Owners and Admins can delete ingredients
router.delete('/:id', authorizeRoles(['Store Owner', 'Admin']), ingredientController.deleteIngredient);

module.exports = router;
