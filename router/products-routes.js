const routes = require("express").Router();
const productsController = require("../controller/products-controller");

// GET all products
routes.get("/", productsController.getAllProducts);

// GET product by ID
routes.get("/:id", productsController.getProductById);
/*
// CREATE new product
routes.post("/", productsController.createProduct);

// UPDATE product by ID
routes.put("/:id", productsController.updateProduct);

// DELETE product by ID
routes.delete("/:id", productsController.deleteProduct);
*/
module.exports = routes;
