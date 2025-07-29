const productModel = require("../model/products-model");
const asyncWrapper = require("../middleware/asyncWrapper");
const handleError = require("../utils/errorHandler");

// GET all products
const getAllProducts = asyncWrapper(async (req, res) => {
  const response = await productModel.getAllProducts();

  if (!response.rows.length) {
    return handleError(res, 404, "No products found");
  }

  res.status(200).json(response.rows);
});

// GET single product by ID
const getProductById = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const response = await productModel.getProductById(id);

  if (response.rows.length === 0) {
    return handleError(res, 404, "Product not found");
  }

  res.status(200).json(response.rows[0]);
});

// CREATE product
const createProduct = asyncWrapper(async (req, res) => {
  const { name, price, description } = req.body;

  if (!name || !price) {
    return handleError(res, 400, "Name and price are required");
  }

  const response = await productModel.createProduct(name, price, description);
  res.status(201).json(response.rows[0]);
});

// UPDATE product
const updateProduct = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const { name, price, description } = req.body;

  if (!name || !price) {
    return handleError(res, 400, "Name and price are required");
  }

  const response = await productModel.updateProduct(
    id,
    name,
    price,
    description
  );

  if (response.rows.length === 0) {
    return handleError(res, 404, "Product not found");
  }

  res.status(200).json(response.rows[0]);
});

// DELETE product
const deleteProduct = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const response = await productModel.deleteProduct(id);

  if (response.rowCount === 0) {
    return handleError(res, 404, "Product not found");
  }

  res.status(200).json({ message: "Product deleted successfully" });
});

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
};
