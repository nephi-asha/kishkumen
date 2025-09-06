const router = require("express").Router();
const ingredientRoutes = require("./ingredients-routes");
const productsRoutes = require("./products-routes");
const authRoutes = require("./auth-routes"); 
const userRoutes = require("./user-routes"); 
const recipeRoutes = require("./recipe-routes")
const salesRoutes = require("./sales-routes");
const purchase_requestsRoutes = require("./purchase-request-routes");
const expenseRoutes = require("./expense-routes");
const reportRoutes = require("./report-routes");
const restockRoutes = require('./restocks-routes');
const opayRoutes = require('./opay-routes');


router.get("/", (req, res) => {
  res.json("Welcome to Deseret 🐝🍯!");
});

router.use("/ingredients", ingredientRoutes);
router.use("/products", productsRoutes);
router.use("/auth", authRoutes);
router.use("/users", userRoutes); 
router.use("/recipes", recipeRoutes);
router.use("/sales", salesRoutes); 
router.use("/purchase-requests", purchase_requestsRoutes); 
router.use("/expenses", expenseRoutes);
router.use("/reports", reportRoutes);
router.use("/restocks", restockRoutes);
router.use("/opay", opayRoutes);


module.exports = router;
