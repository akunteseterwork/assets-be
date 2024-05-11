const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { basicAuthMiddleware, customHeaderMiddleware } = require('../middleware/custom');
const { validateToken } = require('../middleware/auth');
const { Telegram } = require('../middleware/telegram');

router.post('/', basicAuthMiddleware, customHeaderMiddleware, async (req, res) => {
    try {
        const { userId, type, content } = req.body;

        const user = await prisma.user.findUnique({
            where: {
              id: userId,
            },
          });

        if (!userId || !type || !content) {
            return res.status(422).json({ code: 422, message: 'All fields are required' });
        }
        if (type.length > 20) {
            return res.status(422).json({ code: 422, message: 'Maximum length of type is 20' });
        }

        if (content.length > 255) {
            return res.status(422).json({ code: 422, message: 'Maximum length of content is 255' });
        }
        const userExists = await prisma.user.findUnique({
            where: {
                id: parseInt(userId),
                deletedAt: null
            },
        });

        if (!userExists) {
            return res.status(422).json({ code: 422, message: 'User not found' });
        }

        const newNotification = await prisma.notification.create({
            data: {
                userId: parseInt(userId),
                type,
                content,
                read: false
            },
        });
        delete newNotification.deletedAt;
        await Telegram(
            "system", 
            'notification-activity', 
            'Successfully create notification, to: '+user.username+ ', message: '+content
          );
        res.status(201).json({ code: 201, data: newNotification, message: 'Notification created successfully' });
    } catch (error) {
        await Telegram(
            "panic-error", 
            'notification-activity', 
            'Failed to create notification, '+error
          );
        res.status(500).json({ code: 500, message: 'Failed to create notification' });
    }
});

router.put('/read/:id', validateToken , async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId

        const user = await prisma.user.findUnique({
            where: {
              id: userId,
            },
          });

        if (!id || isNaN(parseInt(id))) {
            return res.status(422).json({ code: 422, message: 'Invalid notification id' });
          }

        const notification = await prisma.notification.findUnique({
            where: {
                userId: userId,
                id: parseInt(id),
                read: false,
                deletedAt: null
            },
        });

        if (!notification) {
            return res.status(404).json({ code: 404, message: 'Notification not found' });
        }

        const updatedNotification = await prisma.notification.update({
            where: {
                id: parseInt(id),
            },
            data: {
                read: true,
            },
        });

        delete updatedNotification.userId;
        delete updatedNotification.deletedAt;
        await Telegram(
            user.username, 
            'notification-activity', 
            'Successfully read notification, message: '+updatedNotification.content
          );
        res.status(200).json({ code: 200, data: updatedNotification, message: 'Notification read successfully' });
    } catch (error) {
        await Telegram(
            "panic-error", 
            'notification-activity', 
            'Failed to read notification, '+error
          );
        res.status(500).json({ code: 500, message: 'Failed to update notification read status' });
    }
});

router.get('/all', validateToken, async (req, res) => {
    const { role } = req.user;
  if (role !== "superadmin") {
    return res.status(403).json({ code: 403, message: 'Only superadmin users can create new users' });
  }
    try {
        let totalCount;
        const page = parseInt(req.query.page) || 1;
        const per_page = parseInt(req.query.per_page) || 3;

        const skip = (page - 1) * per_page;

        const filter = {
            deletedAt: null
        };

        const notifications = await prisma.notification.findMany({
            where: filter,
            select: {
                id: true,
                type: true,
                content: true,
                user: {
                    select: {
                        username: true
                    }
                },
                read: true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: [
                { updatedAt: 'desc' }
            ],
            skip,
            take: per_page
        });

        totalCount = await prisma.notification.count({
            where: filter
        });

        if (!notifications.length) {
            return res.status(404).json({ code: 404, message: 'Notifications not found' });
        };

        const formattedNotifications = notifications.map(notification => ({
            ...notification,
            user: notification.user.username
        }));

        res.status(200).json({ code: 200, data: formattedNotifications, page: page, total_pages: Math.ceil(totalCount / per_page), per_page: per_page, total: totalCount, message: 'Notifications retrieved successfully' });
    } catch (error) {
        await Telegram(
            "panic-error", 
            'notification-activity', 
            'Failed to retrieve all notifications, '+error
          );
        res.status(500).json({ code: 500, message: 'Failed to retrieve all notifications ' + error });
    }
});


router.get('/', validateToken, async (req, res) => {
    try {
        let totalCount;
        const userId = req.user.userId;
        const userExists = await prisma.user.findUnique({
            where: {
                id: userId,
            },
        });

        if (!userExists) {
            return res.status(404).json({ code: 404, message: 'User not found' });
        }

        const page = parseInt(req.query.page) || 1;
        const per_page = parseInt(req.query.per_page) || 3;
        const readFilter = req.query.read;

        const skip = (page - 1) * per_page;

        const filter = {
            userId,
            deletedAt: null,
            read : readFilter ? readFilter === 'true' : undefined
        };

        const notifications = await prisma.notification.findMany({
            where: filter,
            select: {
                id: true,
                type: true,
                content: true,
                read: true,
                createdAt: true,
                updatedAt: true
            },
            orderBy: [
                { updatedAt: 'desc' }
            ],
            skip,
            take: per_page
        });

        totalCount = await prisma.notification.count({
            where: filter
        });

        if (!notifications.length) {
            return res.status(404).json({ code: 404, message: 'Notifications not found' });
        };

        res.status(200).json({ code: 200, data: notifications, page: page, per_page: per_page, total: totalCount, message: 'Notifications retrieved successfully' });
    } catch (error) {
        await Telegram(
            "panic-error", 
            'notification-activity', 
            'Failed to retrieve notification, '+error
          );
        res.status(500).json({ code: 500, message: 'Failed to retrieve notifications ' + error });
    }
});


router.put('/:id', validateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, type, content } = req.body;

        if (!userId || !type || !content) {
            return res.status(422).json({ code: 422, message: 'All fields are required' });
        }

        if (type.length > 20) {
            return res.status(422).json({ code: 422, message: 'Maximum length of type is 20' });
        }

        if (content.length > 255) {
            return res.status(422).json({ code: 422, message: 'Maximum length of content is 255' });
        }

        if (!id || isNaN(parseInt(id))) {
            return res.status(422).json({ code: 422, message: 'Invalid notification id' });
          }

        const userExists = await prisma.user.findUnique({
            where: {
                id: parseInt(userId),
                deletedAt: null
            },
        });

        if (!userExists) {
            return res.status(422).json({ code: 422, message: 'User not found' });
        }

        const updatedNotification = await prisma.notification.update({
            where: {
                id: parseInt(id),
            },
            data: {
                userId: parseInt(userId),
                type,
                content,
            },
        });
        await Telegram(
            'system',
            'notification-activity',
            'An admin updated notification, to: '+userExists.username+ ',  message: '+content
        )
        delete updatedNotification.deletedAt;
        res.status(200).json({ code: 200, data: updatedNotification, message: 'Notification updated successfully' });
    } catch (error) {
        await Telegram(
            "panic-error", 
            'notification-activity', 
            'Failed to read notification, '+error
          );
        res.status(500).json({ code: 500, message: 'Failed to update notification' });
    }
});

router.delete('/:id', validateToken, async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || isNaN(parseInt(id))) {
            return res.status(422).json({ code: 422, message: 'Invalid notification id' });
          }

        const notificationExists = await prisma.notification.findUnique({
            where: {
                id: parseInt(id),
                deletedAt: null
            },
        });

        if (!notificationExists) {
            return res.status(404).json({ code: 404, message: 'Notification not found' });
        }

        await prisma.notification.delete({
            where: {
                id: parseInt(id),
            },
        });
        await Telegram(
            'system',
            'notification-activity',
            'An admin deleted notification, to: '+notificationExists.userId+ ',  message: '+notificationExists.content
        )
        res.status(200).json({ code: 200, message: 'Notification deleted successfully' });
    } catch (error) {
        await Telegram(
            "panic-error", 
            'notification-activity', 
            'Failed to delete notification, '+error
          );
        res.status(500).json({ code: 500, message: 'Failed to delete notification' +error });
    }
});

router.post('/global', basicAuthMiddleware, customHeaderMiddleware, async (req, res) => {
    try {
        const { type, content } = req.body;

        if (!type || !content) {
            return res.status(422).json({ code: 422, message: 'All fields are required' });
        }

        if (type.length > 20) {
            return res.status(422).json({ code: 422, message: 'Maximum length of type is 20' });
        }

        if (content.length > 255) {
            return res.status(422).json({ code: 422, message: 'Maximum length of content is 255' });
        }

        const activeUsers = await prisma.user.findMany({
            where: {
                status: 'active',
                deletedAt: null
            },
            select: {
                id: true,
            },
        });

        if (!activeUsers.length) {
            return res.status(404).json({ code: 404, message: 'No active users found' });
        }

        const notifications = await Promise.all(
            activeUsers.map(async (user) => {
                return prisma.notification.create({
                    data: {
                        userId: user.id,
                        type,
                        content,
                        read: false
                    },
                    select: {
                        id: true,
                        userId: true,
                        type: true,
                        content: true,
                        createdAt: true,
                        updatedAt: true
                    },
                });
            })
        );

        const totalNotifications = notifications.length;
        await Telegram(
            'system',
            'notification-activity',
            'An admin just sent global notification, to: ' + totalNotifications+ ' users,  message: '+content
        )
        res.status(201).json({
            code: 201,
            type,
            content,
            total: totalNotifications,
            message: 'Global notifications sent successfully'
        });
    } catch (error) {
        await Telegram(
            "panic-error", 
            'notification-activity', 
            'Failed to send global notification, '+error
          );
        res.status(500).json({ code: 500, message: 'Failed to send global notifications' });
    }
});




module.exports = router;
