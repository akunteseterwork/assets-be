const express = require('express');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const cors = require('cors'); 

const userRoutes = require('./routes/users');
const authRoutes = require('./routes/auth');
const freepikRoutes = require('./routes/freepik');
const envatoRoutes = require('./routes/envato');
const voucherRoutes = require('./routes/voucher');
const driveRoutes = require('./routes/drive');
const downloadRoutes = require('./routes/downloads');
const notificationRoutes = require('./routes/notification');

dotenv.config();

const app = express();
app.use(cookieParser());
app.use(cors({ origin: 'http://localhost:3001', credentials: true }));
app.use(express.json());

app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/freepik', freepikRoutes);
app.use('/api/envato', envatoRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/downloads', downloadRoutes);
app.use('/api/notifications', notificationRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
