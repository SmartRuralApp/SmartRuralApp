module.exports = (req, res) => {
  try {
    const server = require('../server.js');
    res.status(200).json({
      success: true,
      message: "Server module loaded successfully!",
      hasServer: !!server,
      serverType: typeof server
    });
  } catch (err) {
    res.status(200).json({
      success: false,
      error: "Server module load failed",
      message: err.message,
      stack: err.stack
    });
  }
};
