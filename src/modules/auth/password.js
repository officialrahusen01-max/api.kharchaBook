import { promisify } from 'node:util';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const scrypt = promisify(scryptCallback);
const keyLength = 64;
const cost = 16384;
const blockSize = 8;
const parallelization = 1;

const isFourDigitPassword = (password) => (
    typeof password === 'string' && /^[0-9]{4}$/.test(password)
);

export const hashPassword = async (password) => {
    if (!isFourDigitPassword(password)) {
        throw new TypeError('Password must be exactly 4 digits.');
    }

    const salt = randomBytes(16);
    const derivedKey = await scrypt(password, salt, keyLength, {
        N: cost,
        r: blockSize,
        p: parallelization,
        maxmem: 64 * 1024 * 1024,
    });

    return [
        'scrypt',
        cost,
        blockSize,
        parallelization,
        salt.toString('base64url'),
        derivedKey.toString('base64url'),
    ].join('$');
};

export const verifyPassword = async (password, encodedHash) => {
    if (!isFourDigitPassword(password) || typeof encodedHash !== 'string') return false;

    const [algorithm, storedCost, storedBlockSize, storedParallelization, saltText, hashText]
        = encodedHash.split('$');
    const parameters = [storedCost, storedBlockSize, storedParallelization].map(Number);

    if (
        algorithm !== 'scrypt'
        || parameters[0] !== cost
        || parameters[1] !== blockSize
        || parameters[2] !== parallelization
        || !saltText
        || !hashText
    ) {
        return false;
    }

    const salt = Buffer.from(saltText, 'base64url');
    const expectedHash = Buffer.from(hashText, 'base64url');
    if (salt.length === 0 || expectedHash.length !== keyLength) return false;

    const actualHash = await scrypt(password, salt, expectedHash.length, {
        N: parameters[0],
        r: parameters[1],
        p: parameters[2],
        maxmem: 64 * 1024 * 1024,
    });

    return timingSafeEqual(actualHash, expectedHash);
};
