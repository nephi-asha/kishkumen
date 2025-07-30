const jwt = require("jsonwebtoken");

const login = async function (req, res) {
  try {
    // const { username, password } = req.body;

    // LOGIC TO FIND USER HERE

    // LOGIC TO COMPARE PASSWORDS
    const token = jwt.sign(
      {
        id: "myId",
        username: "philipBawun",
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    res.status(200).json({ token });
  } catch (error) {
    res.status(500).json({ message: "Error in Authentication" });
  }
};

module.exports(login);
