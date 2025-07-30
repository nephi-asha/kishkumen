const express = require('express');
const router = express.Router();
const recipeController = require('../controller/recipe-controller');
const { authorizeRoles } = require('../middleware/auth'); // Import authorizeRoles

// GET all recipes for the authenticated user's bakery
// Accessible by any authenticated user within a bakery
router.get('/', recipeController.getAllRecipes);

// GET single recipe by ID, including its ingredients
// Accessible by any authenticated user within a bakery
router.get('/:id', recipeController.getRecipeById);

// CREATE new recipe
// Only Store Owners, Admins, and Bakers can create recipes
router.post('/', authorizeRoles(['Store Owner', 'Admin', 'Baker']), recipeController.createRecipe);

// UPDATE recipe by ID
// Only Store Owners, Admins, and Bakers can update recipes
router.put('/:id', authorizeRoles(['Store Owner', 'Admin', 'Baker']), recipeController.updateRecipe);

// DELETE recipe by ID
// Only Store Owners and Admins can delete recipes
router.delete('/:id', authorizeRoles(['Store Owner', 'Admin']), recipeController.deleteRecipe);

module.exports = router;
