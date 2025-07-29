const router = require("express").Router();
const ingredientRoutes = require("./ingredients-routes");
const productsRoutes = require("./products-routes");

router.get("/", (req, res) => {
  res.json("Welcome to Kishkumen!");
});

router.use("/ingredients", ingredientRoutes);
router.use("/products", productsRoutes);

module.exports = router;
