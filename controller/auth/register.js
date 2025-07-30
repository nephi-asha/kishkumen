const bcrypt = require("bcryptjs");

const register = async function (req, res) {
  try {
    const { username, password } = req.body;

    // Check if user already exists
    if (users.find((u) => u.username === username)) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Save the new user in memory
    const user = {
      // Fill this up when schema is ready
    };

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

modules.exports = register;
