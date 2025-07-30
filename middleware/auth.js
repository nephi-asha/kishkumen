const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
  const token = req.header("Authorization");

  // Check if token exists
  if (!token) {
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  // The token is usually in the format "Bearer <token>"
  const tokenString = token.split(" ")[1];

  try {
    // Verify the token
    const decoded = jwt.verify(tokenString, process.env.JWT_SECRET);

    // Attach the user info to the request object
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: "Token is not valid" });
  }
};

module.exports = auth;
