const basicAuth = require('express-basic-auth');

const basicAuthMiddleware = basicAuth({
  users: { 'admin': 'password' }
});

const customHeaderMiddleware = (req, res, next) => {
  const notificationSender = req.headers['x-notification-sender'];

  if (!notificationSender) {
    return res.status(401).json({ code: 401, message: 'Unauthorized' });
  }

  if (notificationSender.toLowerCase() !== 'system' && notificationSender.toLowerCase() !== 'admin') {
    return res.status(401).json({ code: 401, message: 'Unauthorized' });
}

  next();
};

module.exports = { basicAuthMiddleware, customHeaderMiddleware };
