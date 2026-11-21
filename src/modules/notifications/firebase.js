import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import config from '../../config/config.js';

let messaging;

export const getFirebaseMessaging = async () => {
    if (messaging) return messaging;
    if (!config.FIREBASE_SERVICE_ACCOUNT_PATH) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_PATH is required to send push notifications.');
    }

    const serviceAccountPath = path.resolve(process.cwd(), config.FIREBASE_SERVICE_ACCOUNT_PATH);
    let serviceAccount;
    try {
        serviceAccount = JSON.parse(await readFile(serviceAccountPath, 'utf8'));
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error('Firebase service-account file contains invalid JSON.');
        }
        throw error;
    }

    const app = getApps()[0] ?? initializeApp({
        credential: cert(serviceAccount),
    });
    messaging = getMessaging(app);
    return messaging;
};
