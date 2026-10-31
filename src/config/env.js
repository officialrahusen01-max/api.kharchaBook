import dotenv from 'dotenv';

dotenv.config();

const port = Number(process.env.PORT ?? 8000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
}

const mongoUri = process.env.MONGODB_URI?.trim();
if (!mongoUri) {
    throw new Error('MONGODB_URI is required. Add it to your environment or .env file.');
}

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || Buffer.byteLength(jwtSecret, 'utf8') < 32) {
    throw new Error('JWT_SECRET must be set to a secret of at least 32 bytes.');
}

const config = Object.freeze({
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    PORT: port,
    MONGODB_URI: mongoUri,
    JWT_SECRET: jwtSecret,
});

export default config;
