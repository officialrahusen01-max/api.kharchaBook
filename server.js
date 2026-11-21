import app from './src/app.js';
import config from './src/config/config.js';
import { connectDB, disconnectDB } from './src/config/database.js';
import logger from './src/utils/logger.js';
import { startReminderScheduler, stopReminderScheduler } from './src/modules/notifications/service.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const startServer = async () => {
    const server = await new Promise((resolve, reject) => {
        const instance = app.listen(config.PORT, '0.0.0.0', () => resolve(instance));
        instance.once('error', reject);
    });

    logger.info(`Server is running on port ${config.PORT}`);

    // Open the port first so hosts like Render detect the service even if MongoDB is slow or unreachable.
    let stopped = false;
    const connectWithRetry = async () => {
        let delay = 2000;
        while (!stopped) {
            try {
                await connectDB();
                startReminderScheduler();
                return;
            } catch (error) {
                logger.error(`MongoDB connection failed; retrying in ${delay / 1000}s:`, error.message);
                await new Promise((resolve) => setTimeout(resolve, delay).unref());
                delay = Math.min(delay * 2, 30000);
            }
        }
    };
    server.dbReady = connectWithRetry();

    let shuttingDown = false;
    const shutdown = async (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        stopped = true;
        logger.info(`${signal} received; shutting down`);
        await stopReminderScheduler();

        server.close(async (error) => {
            if (error) {
                logger.error(error);
                process.exitCode = 1;
            }

            try {
                await disconnectDB();
            } catch (disconnectError) {
                logger.error(disconnectError);
                process.exitCode = 1;
            }
        });
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    return server;
};

const isMainModule = process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
    startServer().catch((error) => {
        logger.error('Server startup failed:', error);
        process.exitCode = 1;
    });
}