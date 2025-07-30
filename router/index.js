const router = require("express").Router();
const ingredientRoutes = require("./ingredients-routes");
const productsRoutes = require("./products-routes");
const auth = require("../middleware/auth");
const loginController = require("../controller/auth/login");
const registerController = require("../controller/auth/register");

router.get("/", (req, res) => {
  res.json("Welcome to Deseret 🐝🍯!");
});

router.post("/login", loginController);
router.post("/register", registerController);

router.use("/ingredients", auth, ingredientRoutes);
router.use("/products", auth, productsRoutes);

module.exports = router;
