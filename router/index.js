const router = require("express").Router();
const ingredientRoutes = require("./ingredients-routes");
const productsRoutes = require("./products-routes");
<<<<<<< HEAD
const auth = require("../middleware/auth");
const loginController = require("../controller/auth/login");
const registerController = require("../controller/auth/register");
=======
const authRoutes = require("./auth-routes"); 
const userRoutes = require("./user-routes"); 
>>>>>>> 2300881a32c2f606166b8d3e44e66f7fe967b232

router.get("/", (req, res) => {
  res.json("Welcome to Deseret 🐝🍯!");
});

<<<<<<< HEAD
router.post("/login", loginController);
router.post("/register", registerController);

router.use("/ingredients", auth, ingredientRoutes);
router.use("/products", auth, productsRoutes);
=======
router.use("/ingredients", ingredientRoutes);
router.use("/products", productsRoutes);
router.use("/auth", authRoutes);
router.use("/users", userRoutes); 
>>>>>>> 2300881a32c2f606166b8d3e44e66f7fe967b232

module.exports = router;
