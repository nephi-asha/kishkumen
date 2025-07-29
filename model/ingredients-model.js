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
async function createIngredient(name, quantity) {
  return await pool.query(
    "INSERT INTO ingredients (name, quantity) VALUES ($1, $2) RETURNING *",
    [name, quantity]
  );
}

// UPDATE ingredient
async function updateIngredient(id, name, quantity) {
  return await pool.query(
    "UPDATE ingredients SET name = $1, quantity = $2 WHERE ingredient_id = $3 RETURNING *",
    [name, quantity, id]
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
