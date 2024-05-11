const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
const { validateToken } = require('../middleware/auth'); 
const { Telegram } = require('../middleware/telegram');

router.post('/', validateToken, async (req, res) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ code: 403, message: 'Only superadmin can access this route' });
  }
  try {
    const { username, email, password } = req.body;

    const existingUserByUsername = await prisma.user.findFirst({
      where: {
        username,
      },
    });

    if (existingUserByUsername) {
      return res.status(409).json({ code: 409, message: 'Username already exists' });
    }

    const existingUserByEmail = await prisma.user.findFirst({
      where: {
        email,
      },
    });

    if (existingUserByEmail) {
      return res.status(409).json({ code:409, message: 'Email already exists' });
    }
    const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*()_+[\]{};':"\\|,.<>/?]).{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(422).json({
        code: 422,
        message: 'Password must contain at least 8 characters, including at least one uppercase letter, one lowercase letter, one number, and one symbol',
      });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        role : "user",
        status : "active",
      },
    });
    
    const userData = {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
      status: newUser.status
    };

    await Telegram(
      'system', 
      'user-activity', 
      'An admin just created user, username: '+userData.username+ ', email: '+userData.email+ 'role: '+userData.role
    );

    res.status(201).json({ code: 201, data: userData, message: 'Successfully create user' });
  } catch (error) {
    await Telegram(
      'panic-error', 
      'user-activity', 
      'Failed to create user, '+error
    );
    res.status(500).json({ error: 'Failed to create user '+error });
  }
});

router.get('/', validateToken, async (req, res) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ code: 403, message: 'Only superadmin can access this route' });
  }

  let page = req.query.page ? parseInt(req.query.page) : 1;
  let perPage = req.query.per_page ? parseInt(req.query.per_page) : 10;

  if (perPage > 25) {
    return res.status(422).json({ code: 422, message: 'Maximum per_page is 25' });
  }

  const username = req.query.username;
  const email = req.query.email;

  try {
    let users;
    let totalCount;

    if (username) {
      users = await prisma.user.findMany({
        where: {
          username: {
            contains: username
          }
        },
        take: perPage,
        skip: (page - 1) * perPage,
        include: {
          vouchers: true,
        },
      });

      totalCount = users.length; 
    } else if (email) {
      users = await prisma.user.findMany({
        where: {
          email: {
            contains: email
          }
        },
        take: perPage,
        skip: (page - 1) * perPage,
        include: {
          vouchers: true,
        },
      });

      totalCount = users.length;
    } else {
      totalCount = await prisma.user.count();
      users = await prisma.user.findMany({
        take: perPage,
        skip: (page - 1) * perPage,
        include: {
          vouchers: true,
        },
      });
    }

    const totalPages = Math.ceil(totalCount / perPage);

    if (page > totalPages) {
      return res.status(200).json({
        code: 200,
        data: null,
        pagination: {
          page,
          page_total: totalPages,
          per_page: perPage,
          total: totalCount
        },
        message: 'Successfully get list users'
      });
    }

    const userData = users.map(user => {
      return {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
        vouchers: user.vouchers,
      };
    });

    res.status(200).json({
      code: 200,
      data: userData,
      pagination: {
        page,
        page_total: totalPages,
        per_page: perPage,
        total: totalCount
      },
      message: 'Successfully get list users'
    });
  } catch (error) {
    await Telegram(
      'panic-error', 
      'user-activity', 
      'Failed to fetch user, '+error
    );
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/downloads', validateToken, async (req, res) => {
  const userId = req.user.userId;
  let page = req.query.page ? parseInt(req.query.page) : 1;
  let perPage = req.query.per_page ? parseInt(req.query.per_page) : 10;
  let sort = req.query.sort || 'desc';

  if (perPage > 25) {
    return res.status(422).json({ code: 422, message: 'Maximum per_page is 25' });
  }

  const searchName = req.query.name;

  try {
    let downloads;
    let totalCount;

    if (searchName) {
      downloads = await prisma.download.findMany({
        where: {
          userId,
          filename: {
            contains: searchName
          },
          deletedAt: null
        },
        select: {
          id: true,
          filename: true,
          url: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true
        },
        take: perPage,
        skip: (page - 1) * perPage,
        orderBy: {
          createdAt: sort
        }
      });
      totalCount = await prisma.download.count({
        where: {
          userId,
          filename: {
            contains: searchName
          },
          deletedAt: null
        }
      });
    } else {
      downloads = await prisma.download.findMany({
        where: {
          userId,
          deletedAt: null
        },
        select: {
          id: true,
          filename: true,
          url: true,
          status: true,
          createdAt: true,
          updatedAt: true
        },
        take: perPage,
        skip: (page - 1) * perPage,
        orderBy: {
          createdAt: sort
        }
      });
      totalCount = await prisma.download.count({
        where: {
          userId,
          deletedAt: null
        }
      });
    }

    const totalPages = Math.ceil(totalCount / perPage);

    if (page > totalPages) {
      return res.status(200).json({
        code: 200,
        data: null,
        pagination: {
          page,
          page_total: totalPages,
          per_page: perPage,
          total: totalCount
        },
        message: 'Successfully get list of downloads'
      });
    }

    res.status(200).json({
      code: 200,
      data: downloads,
      pagination: {
        page,
        page_total: totalPages,
        per_page: perPage,
        total: totalCount
      },
      message: 'Successfully get list of downloads'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch downloads' });
  }
});


router.get('/profile', validateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        vouchers: {
          select: {
            code: true,
            name: true,
            limit: true,
            remaining: true,
            createdAt: true,
            updatedAt: true,
          },
          where: {
            deletedAt: null 
          }
        },
      },
    });
    if (!user) {
      return res.status(404).json({ code: 404, message: 'User not found' });
    }

    delete user.id;
    delete user.password;
    delete user.refreshToken;
    delete user.deletedAt;

    return res.status(200).json({ code: 200, data: user, message: "Successfully get user profile" });
  } catch (error) {
    await Telegram(
      'panic-error', 
      'user-activity', 
      'Failed to fetch user, '+error
    );
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});



router.get('/:id', validateToken, async (req, res) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ code: 403, message: 'Only superadmin can access this route' });
  }
  try {
    const { id } = req.params;
    if (isNaN(parseInt(id))) {
      return res.status(404).json({ code: 404, message: 'User not found' });
    }
    const user = await prisma.user.findUnique({
      where: {
        id: parseInt(id),
      },
      include: {
        vouchers: {
          select: {
            id: true,
            code: true,
            name: true,
            limit: true,
            remaining: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!user) {
      return res.status(404).json({ code: 404, messsage: 'User not found' });
    }
    delete user.refreshToken;
    delete user.password;
    delete user.deletedAt
    return res.status(200).json({ code: 200, data: user, message: "Successfully get user detail" });
  } catch (error) {
    await Telegram(
      'panic-error', 
      'user-activity', 
      'Failed to fetch user, '+error
    );
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.post('/:id/status', validateToken, async (req, res) => {
  const { role } = req.user;
  if (role !== "superadmin") {
    return res.status(403).json({ code: 403, message: 'Only superadmin can access this route' });
  }
  
  const { id } = req.params;
  if (!id || isNaN(parseInt(id))) {
    return res.status(422).json({ code: 422, message: 'Invalid user ID' });
  }
  
  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      select: { username: true, role: true }
    });

    if (!user) {
      return res.status(404).json({ code: 404, message: 'User not found' });
    }

    if (user.role === 'superadmin') {
      return res.status(400).json({ code: 400, message: 'Cannot update superadmin user status' });
    }

    const { status } = req.body;
    if (status !== "active" && status !== "banned") {
      return res.status(422).json({ code: 422, message: 'Status must be either "active" or "banned"' });
    }

    await prisma.user.update({
      where: {
        id: parseInt(id),
      },
      data: {
        status,
      },
    });

    if (status === "active") {
      await Telegram(
        'system', 
        'user-activity', 
        'An admin just activated user, username: '+user.username
      );
      return res.status(201).json({ code: 201, message: 'User status activated successfully' });
    }
    if (status === "banned") {
      await Telegram(
        'system', 
        'user-activity', 
        'An admin just banned user, username: '+user.username
      );
      return res.status(201).json({ code: 201, message: 'User status banned successfully' });
    }
  } catch (error) {
    await Telegram(
      'panic-error', 
      'user-activity', 
      'Failed to change user status, '+error
    );
    res.status(500).json({ error: error });
  }
});


router.delete('/:id', validateToken, async (req, res) => {
  const { role } = req.user;
  if (role !== "superadmin") {
    return res.status(403).json({ code: 403, message: 'Only superadmin users can create new users' });
  }
  try {
    const { id } = req.params;
    if (isNaN(parseInt(id))) {
      return res.status(404).json({ code: 404, message: 'User not found' });
    }
    
    const existingUser = await prisma.user.findUnique({
      where: {
        id: parseInt(id),
      },
    });
    
    if (!existingUser) {
      return res.status(404).json({ code: 404, message: 'User not found' });
    }
    if (existingUser.role === 'superadmin') {
      return res.status(403).json({ code: 403, message: 'Cannot delete superadmin user' });
    }

    await prisma.user.delete({
      where: {
        id: parseInt(id),
      },
    });
    await Telegram(
      'system', 
      'user-activity', 
      'An admin just deleted user, username: '+existingUser.username
    );
    res.json({ code: 200, message: 'User deleted successfully' });
  } catch (error) {
    await Telegram(
      'panic-error', 
      'user-activity', 
      'Failed to delete user, '+error
    );
    res.status(500).json({ error: 'Failed to delete user' });
  }
});


module.exports = router;
