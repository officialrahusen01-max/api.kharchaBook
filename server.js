import app from './src/app.js';
import config from './src/config/config.js';
import { connectDB, disconnectDB } from './src/config/database.js';
import logger from './src/utils/logger.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const startServer = async () => {
    await connectDB();

    const server = await new Promise((resolve, reject) => {
        const instance = app.listen(config.PORT, () => resolve(instance));
        instance.once('error', reject);
    });

    logger.info(`Server is running on port ${config.PORT}`);

    let shuttingDown = false;
    const shutdown = (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        logger.info(`${signal} received; shutting down`);

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