const pool = require("../database/db");

// GET all ingredients
async function getAllIngredients() {
  return await pool.query("SELECT * FROM ingredients");
}

// GET ingredient by ID
async function getIngredientById(id) {
  return await pool.query(
    "SELECT * FROM ingredients WHERE ingredient_id = $1",
    [id]
  );
}

// CREATE ingredient
async function createIngredient(
  name,
  ingredient_mesaurement,
  quantity,
  re_order_level
) {
  return await pool.query(
    "INSERT INTO Ingredients (ingredient_name, unit_of_measure, current_stock_quantity, reorder_level)  VALUES  ($1, $2, $3, $4) RETURNING *",
    [name, ingredient_mesaurement, quantity, re_order_level]
  );
}

// UPDATE ingredient
async function updateIngredient(id, name, quantity) {
  return await pool.query(
    "UPDATE Ingredients SET current_stock_quantity = $1, ingredient_name = $2, updated_at = CURRENT_TIMESTAMP WHERE ingredient_id = $3 RETURNING ingredient_id, ingredient_name, current_stock_quantity",
    [quantity, name, id]
  );
}

// DELETE ingredient
async function deleteIngredient(id) {
  return await pool.query("DELETE FROM ingredients WHERE ingredient_id = $1", [
    id,
  ]);
}

module.exports = {
  getAllIngredients,
  getIngredientById,
  createIngredient,
  updateIngredient,
  deleteIngredient,
};
