const { google } = require('googleapis');
const credentials = require('../../oauth.json');
const fs = require('fs');
const byteSize = require('byte-size');
const { Readable } = require('stream');
const axios = require('axios');
const oauth2Client = new google.auth.OAuth2(
  credentials.web.client_id,
  credentials.web.client_secret,
  credentials.web.redirect_uris[0]
)
try {
  const tokenData = fs.readFileSync('./token.json');
  const tokens = JSON.parse(tokenData);
  oauth2Client.setCredentials(tokens);
} catch (error) {
  console.error('Error loading access token:', error);
}

async function getDriveFiles(search) {
  try {
    let query = `'${process.env.DRIVE_FOLDER}' in parents`;
    if (search) {
      query += ` and name contains '${search}'`;
    }
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const response = await drive.files.list({
      q: query,
      pageSize: 10,
      fields: 'files(id, name, mimeType, createdTime, modifiedTime)', 
    });
    let files = response.data.files.map(file => ({
      name: file.name,
      directlink: `https://drive.google.com/uc?id=${file.id}`,
      createdAt: file.createdTime,
      updatedAt: file.modifiedTime,
    }));

    files.sort((a, b) => {
      return new Date(b.createdAt || b.updatedAt) - new Date(a.createdAt || a.updatedAt);
    });

    return files;
  } catch (error) {
    return error;
  }
}

async function getStorageInfo() {
  try {
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const response = await drive.about.get({
      fields: 'storageQuota',
    });
    const storageQuota = response.data.storageQuota;
    const usage = byteSize(storageQuota.usage).toString();
    const limit = byteSize(storageQuota.limit).toString();
    const remainingBytes = storageQuota.limit - storageQuota.usage;
    const remaining = byteSize(remainingBytes).toString();

    const formattedStorageQuota = {
      limit,
      usage,
      remaining,
      trash: byteSize(storageQuota.usageInDriveTrash).toString()
    };
    return formattedStorageQuota;
  } catch (error) {
    return error
  }
}


const uploadFile = async (url, fileName) => {
  try {
    const response = await axios.get(url, { responseType: 'stream' });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const fileMetadata = {
      name: fileName,
      parents: ['1fuFnyevXsrn3CGPbPhcWHxC4et3EfO7i'],
    };
    
    const media = {
      mimeType: response.headers['content-type'],
      body: response.data, 
    };
    
    const res = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id',
    });
    return res.data.id;
  } catch (error) {
    console.error('Error uploading file:', error.config.cause);
  }
};


module.exports = { getDriveFiles, getStorageInfo, uploadFile }