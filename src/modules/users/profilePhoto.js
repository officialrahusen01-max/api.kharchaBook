import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import ApiError from '../../utils/ApiError.js';

export const profilePhotoDirectory = fileURLToPath(
    new URL('../../../uploads/profile-photos/', import.meta.url),
);
const publicDirectory = '/uploads/profile-photos';
const maxPhotoSize = 5 * 1024 * 1024;

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: maxPhotoSize,
        files: 1,
        fields: 5,
        fieldSize: 1024,
    },
    fileFilter: (req, file, callback) => {
        if (!allowedMimeTypes.has(file.mimetype)) {
            callback(new ApiError(400, 'Profile photo must be a JPEG, PNG, or WebP image.'));
            return;
        }
        callback(null, true);
    },
});

export const parseProfilePhoto = (req, res, next) => {
    upload.single('profilePhoto')(req, res, (error) => {
        if (error instanceof multer.MulterError) {
            const statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
            next(new ApiError(
                statusCode,
                statusCode === 413
                    ? 'Profile photo must be 5 MB or smaller.'
                    : 'Invalid profile photo upload.',
            ));
            return;
        }
        next(error);
    });
};

const getImageExtension = (buffer) => {
    if (
        buffer.length >= 3
        && buffer[0] === 0xff
        && buffer[1] === 0xd8
        && buffer[2] === 0xff
    ) {
        return '.jpg';
    }

    if (
        buffer.length >= 8
        && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
        return '.png';
    }

    if (
        buffer.length >= 12
        && buffer.toString('ascii', 0, 4) === 'RIFF'
        && buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
        return '.webp';
    }

    return null;
};

export const saveProfilePhoto = async (file) => {
    const extension = getImageExtension(file.buffer);
    if (!extension) {
        throw new ApiError(400, 'Uploaded file is not a valid JPEG, PNG, or WebP image.');
    }

    await mkdir(profilePhotoDirectory, { recursive: true });
    const filename = `${randomUUID()}${extension}`;
    const filePath = join(profilePhotoDirectory, filename);
    await writeFile(filePath, file.buffer, { flag: 'wx' });

    return {
        filename,
        path: `${publicDirectory}/${filename}`,
        filePath,
    };
};

export const deleteProfilePhoto = async (photoPath) => {
    if (typeof photoPath !== 'string' || !photoPath.startsWith(`${publicDirectory}/`)) return;

    const filename = photoPath.slice(publicDirectory.length + 1);
    if (!/^[\da-f-]+\.(?:jpg|png|webp)$/i.test(filename)) return;

    try {
        await unlink(join(profilePhotoDirectory, filename));
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
};
