const routes = require("express").Router();
const ingredientController = require("../controller/ingredient-controller");

// GET all ingredients
routes.get("/", ingredientController.getAllIngredients);

// GET single ingredient by ID
routes.get("/:id", ingredientController.getIngredientById);

// CREATE new ingredient
routes.post("/", ingredientController.createIngredient);

// UPDATE ingredient by ID
routes.put("/:id", ingredientController.updateIngredient);

// DELETE ingredient by ID
routes.delete("/:id", ingredientController.deleteIngredient);

module.exports = routes;
