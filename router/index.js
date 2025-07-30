const router = require("express").Router();
const ingredientRoutes = require("./ingredients-routes");
const productsRoutes = require("./products-routes");
const authRoutes = require("./auth-routes"); 
const userRoutes = require("./user-routes"); 

router.get("/", (req, res) => {
  res.json("Welcome to Kishkumen!");
});

router.use("/ingredients", ingredientRoutes);
router.use("/products", productsRoutes);
router.use("/auth", authRoutes);
router.use("/users", userRoutes); 

module.exports = router;
