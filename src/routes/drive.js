const express = require('express');
const router = express.Router();
const { getStorageInfo, getDriveFiles } = require('../middleware/drive');

router.get('/files', async (req, res) => {
  const { search } = req.query;
  try {
    const files = await getDriveFiles(search);
    if(files.length === 0) {
      return res.status(404).json({ code: 404, message: 'No files found' });
    }
    res.status(200).json({ code: 200, data: files, message: 'Successfully retrieved list of files' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/storage', async (req, res) => {
    try {
      const files = await getStorageInfo();
      res.status(200).json({ code: 200, data:files , message: 'Successfully get storage info' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });


module.exports = router;
