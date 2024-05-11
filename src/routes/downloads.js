const express = require('express');
const router = express.Router();
const xss = require('xss');
const { validateToken } = require('../middleware/auth');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { Telegram } = require('../middleware/telegram');

router.post('/', validateToken, async (req, res) => {
  try {
    let { url } = req.body;
    const userId = req.user.userId;

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!url) {
      return res.status(422).json({ code: 422, message: 'URL is required' });
    }

    if (!url.startsWith('https://')) {
      return res.status(422).json({ code: 422, message: 'URL must start with https://' });
    }

    if (!url.includes('freepik' || 'envato')) {
      return res.status(422).json({ code: 422, message: 'Can only download from freepik and envato' });
    }

    url = xss(url);

    if (url.length < 3 || url.length > 300) {
      return res.status(422).json({ code: 422, message: 'URL must be between 3 and 300 characters' });
    }

    const existingDownload = await prisma.download.findFirst({
      where: {
        userId: userId,
        url: url,
        deletedAt: null
      },
    });

    if (existingDownload) {
      return res.status(406).json({
        code: 406,
        message: `url already exists with download status ${existingDownload.status}`,
      });
    }

    const data = await prisma.download.create({
      data: {
        filename: 'waiting from server',
        url,
        status: 'waiting',
        userId: userId,
      },
    });

    await Telegram(
      user.username, 
      'download-create', 
      'User successfully create download, url: '+url
    );

    res.status(201).json({
      code: 201,
      data: {
        id: data.id,
        name: data.name,
        url: data.url,
        status: data.status,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      },
      message: 'Download created successfully',
    });
  } catch (error) {
    await Telegram(
      'panic-error', 
      'download-create', 
      'Failed to create download, url: '+url
    );
    res.status(500).json({ error: 'Failed to create download' });
  }
});

router.get('/', validateToken, async (req, res) => {
  const userId = req.user.userId;

  let page = req.query.page ? parseInt(req.query.page) : 1;
  let per_page = req.query.per_page ? parseInt(req.query.per_page) : 10;
  let sort = req.query.sort || 'desc';
  const statusFilter = req.query.status;

  if (per_page > 25) {
    return res.status(422).json({ code: 422, message: 'Maximum per_page is 25' });
  }

  const searchname = req.query.name;

  try {
    let downloads;
    let totalCount;

    const whereClause = {
      userId,
      deletedAt: null
    };

    if (searchname) {
      whereClause.filename = {
        contains: searchname
      };
    }

    if (statusFilter) {
      whereClause.status = statusFilter;
    }

    downloads = await prisma.download.findMany({
      where: whereClause,
      select: {
        id: true,
        filename: true,
        url: true,
        status: true,
        createdAt: true,
        updatedAt: true
      },
      take: per_page,
      skip: (page - 1) * per_page,
      orderBy: {
        updatedAt: sort
      }
    });

    totalCount = await prisma.download.count({
      where: whereClause
    });

    const totalPages = Math.ceil(totalCount / per_page);

    if (page > totalPages) {
      return res.status(200).json({
        code: 200,
        data: null,
        pagination: {
          page,
          per_page: per_page,
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
        per_page: per_page,
        total: totalCount
      },
      message: 'Successfully get list of downloads'
    });
  } catch (error) {
    await Telegram(
      'panic-error', 
      'download-fetch', 
      'Failed to fetch downloads, url: '+url
    );
    res.status(500).json({ error: 'Failed to fetch downloads ' });
  }
});

router.get('/list', validateToken, async (req, res) => {
  let page = req.query.page ? parseInt(req.query.page) : 1;
  let per_page = req.query.per_page ? parseInt(req.query.per_page) : 10;
  let sort = req.query.sort || 'desc';
  const statusFilter = req.query.status;

  if (per_page > 25) {
    return res.status(422).json({ code: 422, message: 'Maximum per_page is 25' });
  }

  const searchname = req.query.name;

  try {
    let downloads;
    let totalCount;

    const whereClause = {
      deletedAt: null
    };

    if (searchname) {
      whereClause.filename = {
        contains: searchname
      };
    }

    if (statusFilter) {
      whereClause.status = statusFilter;
    }

    downloads = await prisma.download.findMany({
      where: whereClause,
      select: {
        id: true,
        userId: true,
        filename: true,
        url: true,
        status: true,
        createdAt: true,
        updatedAt: true
      },
      take: per_page,
      skip: (page - 1) * per_page,
      orderBy: {
        updatedAt: sort
      }
    });

    totalCount = await prisma.download.count({
      where: whereClause
    });

    const totalPages = Math.ceil(totalCount / per_page);

    if (page > totalPages) {
      return res.status(200).json({
        code: 200,
        data: null,
        pagination: {
          page,
          per_page: per_page,
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
        per_page: per_page,
        total: totalCount
      },
      message: 'Successfully get list of downloads'
    });
  } catch (error) {
    await Telegram(
      'panic-error', 
      'download-fetch', 
      'Failed to fetch downloads, url: '+url
    );
    res.status(500).json({ error: 'Failed to fetch downloads ' });
  }
});

router.put('/:id', validateToken, async (req, res) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ code: 403, message: 'Only superadmin can access this route' });
  }
  try {
    const { filename, url, status } = req.body;
    const userId = req.user.userId;
    const downloadId = parseInt(req.params.id);

    if (!filename || !url || !status) {
      return res.status(422).json({ code: 422, message: 'Name, url, and status are required' });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    const existingDownload = await prisma.download.findFirst({
      where: {
        id: downloadId,
        userId: userId,
        deletedAt: null
      }
    });

    if (!existingDownload) {
      return res.status(404).json({ code: 404, message: 'Download not found' });
    }

    const updatedDownload = await prisma.download.update({
      where: {
        id: downloadId
      },
      data: {
        filename: filename,
        url: url,
        status: status
      }
    });

    await Telegram(
      user.username, 
      'download-update', 
      'An admin just updated download url: '+url
    );

    res.status(200).json({ code: 200, data: updatedDownload, message: 'Download updated successfully' });
  } catch (error) {
    await Telegram(
      'panic-error', 
      'download-fetch', 
      'Failed to update download, url: '+url
    );
    res.status(500).json({ error: 'Failed to update download' });
  }
});

router.delete('/:id', validateToken, async (req, res) => {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ code: 403, message: 'Only superadmin can access this route' });
  }
  try {
    const userId = req.user.userId;
    const { id } = req.params;
    const downloadId = parseInt(id);

    if (!downloadId || isNaN(downloadId)) {
      return res.status(422).json({ code: 422, message: 'Invalid download id' });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    const existingDownload = await prisma.download.findFirst({
      where: {
        id: downloadId,
        deletedAt: null
      }
    });

    if (!existingDownload) {
      return res.status(404).json({ code: 404, message: 'Download not found' });
    }

    await prisma.download.update({
      where: {
        id: downloadId
      },
      data: {
        deletedAt: new Date()
      }
    });

    await Telegram(
      user.username, 
      'download-delete', 
      'An admin just delete download, url: '+url
    );

    res.status(200).json({ code: 200, message: 'Download deleted successfully' });
  } catch (error) {
    await Telegram(
      'panic-error', 
      'download-delete', 
      'Failed to delete download, url: '+url
    );
    res.status(500).json({ error: 'Failed to delete download ' + error });
  }
});

module.exports = router;
