import ApiError from '../utils/ApiError.js';
import jwt from 'jsonwebtoken';
import config from '../config/config.js';
import { branchRoles } from '../validators/common.js';

const authenticate = (req, res, next) => {
    const authorization = req.headers.authorization;
    const match = typeof authorization === 'string'
        ? authorization.match(/^Bearer\s+(\S+)$/i)
        : null;

    if (!match) {
        next(new ApiError(401, 'Authentication is required.'));
        return;
    }

    let payload;
    try {
        payload = jwt.verify(match[1], config.JWT_SECRET, {
            issuer: 'kharcha-book-api',
            audience: 'kharcha-book-client',
            algorithms: ['HS256'],
        });
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
            next(new ApiError(401, 'Invalid or expired access token.'));
            return;
        }
        next(error);
        return;
    }

    if (
        typeof payload === 'string'
        || !payload.sub
        || typeof payload.branchId !== 'string'
        || !branchRoles.includes(payload.role)
    ) {
        next(new ApiError(401, 'Invalid or expired access token.'));
        return;
    }

    req.user = { id: payload.sub, branchId: payload.branchId, role: payload.role };
    next();
};

export default authenticate;
