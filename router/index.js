const router = require("express").Router();
const ingredientRoutes = require("./ingredients-routes");
const productsRoutes = require("./products-routes");
const authRoutes = require("./auth-routes"); 
const userRoutes = require("./user-routes"); 
const recipeRoutes = require("./recipe-routes"); // Import recipe routes

router.get("/", (req, res) => {
  res.json("Welcome to Deseret 🐝🍯!");
});

router.use("/ingredients", ingredientRoutes);
router.use("/products", productsRoutes);
router.use("/auth", authRoutes);
router.use("/users", userRoutes); 
router.use("/recipes", recipeRoutes); // Use recipe routes

module.exports = router;
