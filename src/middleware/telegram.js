require('dotenv').config();
const axios = require('axios');

async function Telegram(from, event, message) {
    const payload = {
        'from': from,
        'event': event,
        'message': message,
    };
    try {
        const response = await axios.post(process.env.TELEGRAM_WEBHOOK, payload);
        return response.statusText;
    } catch (error) {
        console.error('Error sending message:', error);
        throw error;
    }
}

module.exports = { Telegram };

