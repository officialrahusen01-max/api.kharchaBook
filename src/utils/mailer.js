import config from '../config/config.js';
import logger from './logger.js';
import ApiError from './ApiError.js';

// Uses the Resend HTTP API (works on Render, which blocks outbound SMTP on free instances).
const send = async ({ to, subject, text }) => {
    if (!config.RESEND_API_KEY) {
        if (config.NODE_ENV === 'production') {
            throw new ApiError(503, 'Email service is not configured.');
        }
        logger.info(`[mail disabled] To: ${to} | ${subject}\n${text}`);
        return;
    }

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${config.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: config.MAIL_FROM, to: [to], subject, text }),
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
        logger.error(`Email provider rejected the message (${response.status}):`, await response.text());
        throw new ApiError(503, 'Could not send the email. Please try again later.');
    }
};

// Exposed as an object so tests can replace `send`.
const mailer = { send };

export default mailer;
