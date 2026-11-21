import { getFirebaseMessaging } from './firebase.js';
import FcmDevice from './device.model.js';
import logger from '../../utils/logger.js';

const removeInvalidDevices = async (tokens, response) => {
    const invalidTokens = response.responses
        .map((result, index) => ({ result, token: tokens[index] }))
        .filter(({ result }) => [
            'messaging/invalid-registration-token',
            'messaging/registration-token-not-registered',
        ].includes(result.error?.code))
        .map(({ token }) => token);

    if (invalidTokens.length > 0) {
        await FcmDevice.deleteMany({ token: { $in: invalidTokens } });
    }
};

export const buildPushMessage = ({ tokens, title, body, data = {} }) => ({
    tokens,
    notification: { title, body },
    data: Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, String(value ?? '')]),
    ),
});

export const sendPushNotification = async (
    { userId, branchId, title, body, data },
) => {
    const deviceFilter = { userId };
    if (branchId) {
        deviceFilter.$or = [
            { branchId },
            { role: 'admin' },
        ];
    }

    const devices = await FcmDevice.find(deviceFilter).select('+token');
    const tokens = devices.map(({ token }) => token).filter(Boolean);
    if (tokens.length === 0) {
        throw new Error('No registered devices are available for this notification.');
    }

    const messaging = await getFirebaseMessaging();
    let delivered = 0;
    let failed = 0;

    for (let offset = 0; offset < tokens.length; offset += 500) {
        const batchTokens = tokens.slice(offset, offset + 500);
        const response = await messaging.sendEachForMulticast(
            buildPushMessage({ tokens: batchTokens, title, body, data }),
        );
        delivered += response.successCount;
        failed += response.failureCount;
        await removeInvalidDevices(batchTokens, response);
    }

    if (delivered === 0) {
        throw new Error(`Push delivery failed for ${failed} device(s).`);
    }
    if (failed > 0) {
        logger.error(`Push delivery partially failed for notification: ${failed} device(s).`);
    }
};
