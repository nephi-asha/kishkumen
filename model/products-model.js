const pool = require("../database/db");

// GET all products
async function getAllProducts() {
  return await pool.query("SELECT * FROM PRODUCTS");
}

// GET product by Id
async function getProductById(id) {
  return await pool.query("SELECT * FROM PRODUCTS where product_id = $1", [id]);
}
module.exports = {
  getAllProducts,
  getProductById,
};
