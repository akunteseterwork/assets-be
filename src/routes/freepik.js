const express = require('express');
const router = express.Router();
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { validateToken } = require('../middleware/auth');
const { uploadFile, getDriveFiles } = require('../middleware/drive');
const { Telegram } = require('../middleware/telegram');

router.post('/', validateToken, async (req, res) => {
  try {
    const { url } = req.body;
    const userId = req.user.userId;

    const extractIdFromUrl = (url) => {
      const matches = url.match(/_(\d+)\.htm/);
      return matches ? matches[1] : null;
    };

    const freepik_id = extractIdFromUrl(url);

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    const userVouchers = await prisma.voucher.findMany({
      where: {
        userId,
        remaining: {
          gt: 0
        },
        deletedAt: null
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    if (userVouchers.length === 0) {
      await Telegram(
        user.username, 
        'freepik-download', 
        'Gagal download, voucher habis, url: '+url
      );
      return res.status(403).json({ code: 403, message: 'No available vouchers' });
    }

    let usedVoucher;
    for (const voucher of userVouchers) {
      if (voucher.remaining > 0) {
        usedVoucher = voucher;
        break;
      }
    };

    const freepikResponse = await axios.get(
      `https://api.freepik.com/v1/resource?id=${freepik_id}`,
      {
        headers: {
          'Accept-Language': 'en',
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36",
          'X-Freepik-API-Key': process.env.FREEPIK_APIKEY
        }
      }
    );
    let fileName = freepikResponse.data.data.filename;


    await prisma.download.create({
      data: {
        filename: 'waiting from server',
        url,
        status: 'waiting',
        userId: userId,
      },
    });

    const driveResponse = await getDriveFiles(fileName);
    let directlink;

    if (driveResponse.length > 0) {
      directlink = driveResponse[0].directlink;
    } else {
      const response = await axios.get(
        `https://api.freepik.com/v1/resources/${freepik_id}/download`,
        {
          headers: {
            'Accept-Language': 'en',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36",
            'X-Freepik-API-Key': process.env.FREEPIK_APIKEY
          },
        }
      );
      const files = response.data;
      directlink = files.data.url;

      uploadFile(directlink, fileName)
        .then(upload => {
          Telegram(
            "freepik-downloader", 
            'google-drive-upload', 
            'Successfully upload to google drive, id: ' + upload
          );
        })
        .catch(error => {
          Telegram(
            user.username, 
            'google-drive-upload', 
            'Gagal upload, ' + error, 
          );
          console.error("Error uploading file, ", error);
        });
    }

    await prisma.download.updateMany({
      where: {
        url: url,
        status: "waiting"
      },
      data: {
        filename: fileName,
        url: directlink,
        status: "completed"
      }
    });

    await prisma.voucher.update({
      where: {
        id: usedVoucher.id
      },
      data: {
        remaining: usedVoucher.remaining - 1
      }
    });

    if (usedVoucher.remaining === 1) {
      await prisma.voucher.update({
        where: {
          id: usedVoucher.id
        },
        data: {
          deletedAt: new Date()
        }
      });
    }

    await Telegram(
      user.username, 
      'freepik-download', 
      'Successfully download, url: '+url
    );
    res.status(200).json(
      { code: 200, 
        data: { 
          name: fileName,
          directlink: directlink 
        }, 
        message: 'Successfully downloaded' 
      });
  } catch (error) {
    await Telegram(
      'panic-error', 
      'freepik-download', 
      'Gagal download, ' + error, 
    );
    console.error('Error processing download:', error);
    res.status(404).json({ code: 404, message: 'The resource could not be found, try another URL or contact support' });
  }
});

module.exports = router;
