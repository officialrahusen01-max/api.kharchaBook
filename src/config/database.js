import mongoose from 'mongoose';
import config from './config.js';
import logger from '../utils/logger.js';

export const connectDB = async () => {
    await mongoose.connect(config.MONGODB_URI);
    const branches = mongoose.connection.collection('branches');
    try {
        // Remove the former unique branch phone index before branches without phone fields are inserted.
        const indexes = await branches.indexes();
        for (const index of indexes.filter(({ key }) => Object.hasOwn(key, 'phoneNumber'))) {
            await branches.dropIndex(index.name);
        }
    } catch (error) {
        if (error.code !== 26) throw error;
    }
    logger.info('Connected to MongoDB');
};

export const disconnectDB = async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
        logger.info('Disconnected from MongoDB');
    }
};

export default connectDB;
