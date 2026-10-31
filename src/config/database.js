import mongoose from 'mongoose';
import config from './config.js';
import logger from '../utils/logger.js';

export const connectDB = async () => {
    await mongoose.connect(config.MONGODB_URI);
    logger.info('Connected to MongoDB');
};

export const disconnectDB = async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
        logger.info('Disconnected from MongoDB');
    }
};

export default connectDB;
