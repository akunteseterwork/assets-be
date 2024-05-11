const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const generateAccessToken = (userId, role) => {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: '1m' }
  );
};

const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
};

const validateToken = async (req, res, next) => {
  const accessToken = req.cookies.access_token;
  const refreshToken = req.cookies.refresh_token;

  try {
    if (!accessToken && !refreshToken) {
      return res.status(401).json({ code: 401, message: 'Unauthorized!' });
    }

    if (accessToken) {
      try {
        const decodedAccessToken = jwt.verify(accessToken, process.env.JWT_SECRET);
        req.user = decodedAccessToken;
        return next();
      } catch (accessTokenError) {
        if (refreshToken) {
          try {
            const decodedRefreshToken = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
            const user = await prisma.user.findUnique({ where: { id: decodedRefreshToken.userId } });
            if (!user || user.refreshToken !== refreshToken) {
              return res.status(401).json({ code: 401, message: 'Unauthorized! Invalid refresh token' });
            }
            const newAccessToken = generateAccessToken(user.id, user.role);

            req.user = {
              userId: user.id,
              username: user.username,
              role: user.role,
              status: user.status
            };
            res.cookie('access_token', newAccessToken, { httpOnly: true, sameSite: 'none', secure: true });
            return next();
          } catch (refreshTokenError) {
            return res.status(401).json({ code: 401, message: 'Unauthorized! ' + refreshTokenError.message });
          }
        } else {
          return res.status(401).json({ code: 401, message: 'Unauthorized! Access token expired and no refresh token provided' });
        }
      }
    } else if (refreshToken) {
      const decodedRefreshToken = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      const user = await prisma.user.findUnique({ where: { id: decodedRefreshToken.userId } });
      if (!user || user.refreshToken !== refreshToken) {
        return res.status(401).json({ code: 401, message: 'Unauthorized! Invalid refresh token' });
      }
      const newAccessToken = generateAccessToken(user.id, user.role);
      req.user = {
        userId: user.id,
        username: user.username,
        role: user.role,
        status: user.status
      };
      res.cookie('access_token', newAccessToken, { httpOnly: true, sameSite: 'none', secure: true });
      return next();
    }
  } catch (error) {
    return res.status(401).json({ code: 401, message: 'Unauthorized! ' + error.message });
  }
};

module.exports = { validateToken, generateRefreshToken };
