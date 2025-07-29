const express = require("express");
const routes = require("./router");

const app = express();

// Parse JSON bodies
app.use(express.json());

// Main routes
app.use("/", routes);

// Global error handler (must be last)
// middleware/globalErrorHandler.js

function globalErrorHandler(err, req, res, next) {
  console.error("Global Error:", err.stack);
  res.status(500).json({ error: "Something went wrong on the server" });
}

module.exports = globalErrorHandler;

module.exports = app;
