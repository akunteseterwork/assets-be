const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { validateToken } = require('../middleware/auth');
const { uploadFile, getDriveFiles } = require('../middleware/drive');
const { Telegram } = require('../middleware/telegram');

router.post('/', validateToken, async (req, res) => {
  try {
    const { url } = req.body;

    const userIdRecord = await prisma.download.findFirst({
      where: {
        url,
        status: 'waiting'
      },
      select: {
        userId: true
      }
    });

    if (!userIdRecord) {
      return res.status(404).json({ code: 404, message: 'No download request found for the url' });
    }

    const userId = userIdRecord.userId;

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
      return res.status(403).json({ code: 403, message: 'No available vouchers' });
    }

    let usedVoucher;
    for (const voucher of userVouchers) {
      if (voucher.remaining > 0) {
        usedVoucher = voucher;
        break;
      }
    }

    let fileName = url.split('/').pop().replace(/-\w+$/, '');
    let directLink = "waiting from server";

    const driveResponse = await getDriveFiles(fileName);
    let finalDirectLink;

    if (driveResponse.length > 0) {
      finalDirectLink = driveResponse[0].directlink;
    } else {
      finalDirectLink = directLink;

      uploadFile(directLink, fileName)
        .then(upload => {
          Telegram(
            "envato-downloader", 
            'google-drive-upload', 
            'Successfully upload to google drive, id: ' + upload
          );
          console.log("Successfully uploaded to Google Drive with ID: " + upload);
        })
        .catch(error => {
          Telegram(
            user.username, 
            'google-drive-upload', 
            'Successfully upload to google drive, id: ' + error
          );
          console.error("Error uploading file:", error);
        });
    }

    await prisma.download.updateMany({
      where: {
        url: url,
        status: "waiting"
      },
      data: {
        filename: fileName,
        url: finalDirectLink,
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
      'envato-download', 
      'Successfully download, url: '+url
    );

    res.status(200).json(
      { 
        code: 200, 
        data: {
          directLink: finalDirectLink 
        }, 
        message: 'Successfully downloaded' });
  } catch (error) {
    await Telegram(
      'panic-error', 
      'freepik-download', 
      'Gagal download, ' + error, 
    );
    console.error('Error processing request:', error);
    res.status(500).json({ code: 500, message: 'Internal server error' });
  }
});

module.exports = router;
