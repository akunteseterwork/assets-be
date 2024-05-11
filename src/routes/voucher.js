const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { validateToken } = require('../middleware/auth');
const xss = require('xss');
const { Telegram } = require('../middleware/telegram');

router.post('/', validateToken, async (req, res) => {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ code: 403, message: 'Only superadmin can access this route' });
    }
    try {
        let { name, limit } = req.body;

        if (!name || !limit) {
            return res.status(422).json({ code: 422, message: 'name and limit are required' });
        }

        name = xss(name)
        limit = parseInt(limit);

        if (limit < 1) {
            return res.status(422).json({ code: 422, message: 'Minimum limit is 1' });
        }

        const code = generateUniqueCode();

        const voucher = await prisma.voucher.create({
            data: {
                code,
                name,
                limit,
                remaining: limit,
            },
        });

        await Telegram(
            'system', 
            'voucher-activity', 
            'Successfully create voucher, code: '+code+ ', name: '+name+', limit: '+limit 
          );

        res.status(201).json({ code: 201, data: voucher, message: 'Voucher created successfully' });
    } catch (error) {
        await Telegram(
            'system', 
            'voucher-activity', 
            'Failed to create voucher, '+error
          );
        res.status(500).json({ error: 'Failed to create voucher' });
    }
});

const generateUniqueCode = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 10; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
};

router.get('/', validateToken, async (req, res) => {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ code: 403, message: 'Only superadmin can access this route' });
    }

    let page = req.query.page ? parseInt(req.query.page) : 1;
    let per_page = req.query.per_page ? parseInt(req.query.per_page) : 10;
    let sort = req.query.sort_order ? req.query.sort_order.toUpperCase() : 'desc';

    if (per_page > 25) {
        return res.status(422).json({ code: 422, message: 'Maximum per_page is 25' });
    }

    const name = req.query.name ? req.query.name.toLowerCase() : '';
    const code = req.query.code ? req.query.code.toLowerCase() : '';

    try {
        const totalCount = await prisma.voucher.count({
            where: {
                name: {
                    contains: name,
                },
                code: {
                    contains: code
                },
                deletedAt: null
            }
        });

        const totalPages = Math.ceil(totalCount / per_page);

        if (page > totalPages) {
            return res.status(200).json({
                code: 200,
                data: null,
                pagination: {
                    page,
                    per_page,
                    total: totalCount
                },
                message: 'No vouchers found on this page'
            });
        }

        const vouchers = await prisma.voucher.findMany({
            where: {
                name: {
                    contains: name
                },
                code: {
                    contains: code
                },
                deletedAt: null
            },
            take: per_page,
            skip: (page - 1) * per_page,
            select: {
                id: true,
                code: true,
                name: true,
                limit: true,
                remaining: true,
                user: {
                    select: {
                        username: true
                    }
                },
                createdAt: true,
                updatedAt: true,
                deletedAt: false,
            },
            orderBy: {
                updatedAt: sort
            }
        });

        res.status(200).json({
            code: 200,
            data: vouchers.map(voucher => {
                return {
                    ...voucher,
                    user: voucher.user ? voucher.user.username : null
                };
            }),
            pagination: {
                page,
                total_page: totalPages,
                per_page,
                total: totalCount
            },
            message: 'Successfully get vouchers'
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch vouchers' });
    }
});



router.get('/:code', validateToken, async (req, res) => {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ code: 403, message: 'Only superadmin can access this route' });
    }
    try {
        const { code } = req.params;

        const voucher = await prisma.voucher.findUnique({
            where: { code },
        });

        if (!voucher) {
            return res.status(404).json({ code: 404, message: 'Voucher not found' });
        }

        res.status(200).json({ code: 200, data: voucher, message: 'Successfully get voucher detail' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch voucher' });
    }
});



router.put('/:code', validateToken, async (req, res) => {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ code: 403, message: 'Only superadmin can access this route' });
    }
    try {
        const { code } = req.params;
        let { name, limit } = req.body;

        if (!name || !limit || isNaN(parseInt(limit)) || parseInt(limit) <= 0) {
            return res.status(400).json({ code: 400, message: 'name and valid limit are required' });
        }

        name = xss(name)
        limit = parseInt(limit)

        const updatedVoucher = await prisma.voucher.update({
            where: { code: code },
            data: {
                name,
                limit,
                remaining: parseInt(limit),
            },
        });

        await Telegram(
            'system', 
            'voucher-activity', 
            'An admin updated voucher, code: '+code+ ', name: '+name+ ', limit: '+limit 
          );

        res.status(200).json({ code: 200, data: updatedVoucher, message: 'Voucher updated successfully' });
    } catch (error) {
        await Telegram(
            'system', 
            'voucher-activity', 
            'Failed to create voucher, '+error
          );
        res.status(500).json({ error: 'Failed to update voucher' + error });
    }
});

router.delete('/:code', validateToken, async (req, res) => {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ code: 403, message: 'Only superadmin can access this route' });
    }
    try {
        const { code } = req.params;
        if (!code) {
            return res.status(422).json({ code: 422, message: 'Voucher code is required' });
        }

        const existingVoucher = await prisma.voucher.findUnique({
            where: { code: code , deletedAt: null},
        });

        if (!existingVoucher) {
            return res.status(404).json({ code: 404, message: 'Voucher not found' });
        }

        await prisma.voucher.update({
            where: { code: code },
            data: { deletedAt: new Date() }
        });

        await Telegram(
            'system', 
            'voucher-activity', 
            'An admin just deleted voucher, code: '+code
          );

        res.status(200).json({ code: 200, message: 'Voucher deleted successfully' });
    } catch (error) {
        await Telegram(
            'system', 
            'voucher-activity', 
            'Failed to delete voucher, '+error
          );
        res.status(500).json({ error: 'Failed to soft delete voucher' + error });
    }
});



router.post('/redeem', validateToken, async (req, res) => {
    try {
        const user_id = req.user.userId;
        let { code } = req.body;
        code = xss(code)

        if (!code) {
            return res.status(422).json({ code: 422, message: 'Voucher code is required' });
        }

        const user = await prisma.user.findUnique({
            where: { id: user_id },
        });

        if (code.length > 50) {
            return res.status(422).json({ code: 422, message: 'Max voucher code length is 50' });
        }

        if (!user) {
            return res.status(404).json({ code: 404, message: 'User not found' });
        }

        const voucher = await prisma.voucher.findUnique({
            where: { code },
        });

        if (!voucher) {
            return res.status(404).json({ code: 404, message: 'Voucher not found' });
        }

        if (voucher.userId) {
            return res.status(409).json({ code: 409, message: 'Voucher is already redeemed' });
        }

        const updatedVoucher = await prisma.voucher.update({
            where: { code },
            data: { user: { connect: { id: user_id } } },
        });

        await Telegram(
            user.username, 
            'voucher-activity', 
            'Successfully redeemed voucher, code: '+voucher.code+ ', name: '+voucher.name+ ', limit: '+voucher.limit
          );

        res.status(200).json({ code: 200, data: updatedVoucher, message: 'Voucher redeemed successfully' });
    } catch (error) {
        await Telegram(
            'system', 
            'voucher-activity', 
            'Failed to redeem voucher, '+error
          );
        res.status(500).json({ error: 'Failed to redeem voucher to user' });
    }
});


module.exports = router;
