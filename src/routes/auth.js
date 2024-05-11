const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();
const { validateToken, generateRefreshToken } = require('../middleware/auth');
const { Telegram } = require('../middleware/telegram');

const generateTokens = (user) => {
  const accessToken = jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
      status: user.status
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '2m',
      algorithm: 'HS512'
    }
  );

  const refreshToken = generateRefreshToken(user.id);

  return { accessToken, refreshToken };
};


router.get('/check', validateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      return res.status(401).json({ code: 401, message: 'Unauthorized' });
    }

    if (user.status === "banned") {
      return res.status(403).json({ code: 403, message: 'You are banned from using our service' });
    }

    res.status(200).json({ code: 200, data: { username: user.username, role: user.role, status: user.status }, message: 'Authenticated' });
  } catch (error) {
    return res.status(401).json({ code: 401, message: 'Unauthorized' });
  }
});



router.post('/', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(401).json({ code: 401, message: 'Invalid username or password' });
    }

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ code: 401, message: 'Invalid username or password' });
    }

    if (user.status === "banned") {
      return res.status(403).json({ code: 403, message: 'You are banned from using our service' });
    }
    const { accessToken, refreshToken } = generateTokens(user);

    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    res.cookie('access_token', accessToken, { httpOnly: true, sameSite: 'none', secure: true });
    res.cookie('refresh_token', refreshToken, { httpOnly: true, sameSite: 'none', secure: true });

    await Telegram(
      user.username, 
      'user-activity', 
      'User successfully login'
    );

    res.status(201).json({ code: 201, access_token: accessToken, refresh_token: refreshToken, message: 'User logged in successfully' });
  } catch (error) {
    res.status(401).json({ code: 401, message: 'Invalid username or password ' + error });
  }
});

router.post('/logout', validateToken, async (req, res) => {
  const userId = req.user.userId;
  
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!user) {
    return res.status(401).json({ code: 401, message: 'Unauthorized' });
  }

  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
  Telegram(
    user.username, 
    'user-activity', 
    'User successfully logout'
  );
  res.status(200).json({ code: 200, message: 'User logged out successfully' });
});

module.exports = router;
