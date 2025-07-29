const ingredientModel = require("../model/ingredients-model");
const asyncWrapper = require("../middleware/asyncWrapper");
const handleError = require("../utils/errorHandler");

// GET all ingredients
const getAllIngredients = asyncWrapper(async (req, res) => {
  const response = await ingredientModel.getAllIngredients();

  if (!response.rows.length) {
    return handleError(res, 404, "No ingredients found");
  }

  res.status(200).json(response.rows);
});

// GET ingredient by ID
const getIngredientById = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const response = await ingredientModel.getIngredientById(id);

  if (response.rows.length === 0) {
    return handleError(res, 404, "Ingredient not found");
  }

  res.status(200).json(response.rows[0]);
});

// CREATE ingredient
const createIngredient = asyncWrapper(async (req, res) => {
  const { name, quantity } = req.body;

  if (!name || !quantity) {
    return handleError(res, 400, "Name and quantity are required");
  }

  const response = await ingredientModel.createIngredient(name, quantity);
  res.status(201).json(response.rows[0]);
});

// UPDATE ingredient
const updateIngredient = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const { name, quantity } = req.body;

  if (!name || !quantity) {
    return handleError(res, 400, "Name and quantity are required");
  }

  const response = await ingredientModel.updateIngredient(id, name, quantity);

  if (response.rows.length === 0) {
    return handleError(res, 404, "Ingredient not found");
  }

  res.status(200).json(response.rows[0]);
});

// DELETE ingredient
const deleteIngredient = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const response = await ingredientModel.deleteIngredient(id);

  if (response.rowCount === 0) {
    return handleError(res, 404, "Ingredient not found");
  }

  res.status(200).json({ message: "Ingredient deleted successfully" });
});

module.exports = {
  getAllIngredients,
  getIngredientById,
  createIngredient,
  updateIngredient,
  deleteIngredient,
};
