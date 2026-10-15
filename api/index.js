let app = null;
let loadError = null;

try {
  app = require('../server.js');
} catch (err) {
  loadError = err;
  console.error("CRITICAL: Failed to load server.js:", err);
}

module.exports = (req, res) => {
  if (loadError) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      error: "Server Initialization Failed",
      message: loadError.message,
      stack: loadError.stack
    }, null, 2));
  }
  return app(req, res);
};

module.exports.default = module.exports;
