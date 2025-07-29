// middleware/asyncWrapper.js

/**
 * Wrap async route handlers to catch errors and pass to next()
 */
function asyncWrapper(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncWrapper;
