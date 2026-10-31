import logger from '../utils/logger.js';
import ApiError from '../utils/ApiError.js';

const errorHandler = (error, req, res, next) => {
    if (res.headersSent) {
        next(error);
        return;
    }

    let statusCode = 500;
    let message = 'Internal server error';
    let details;

    if (error.code === 11000) {
        statusCode = 409;
        message = 'A record with one or more of these details already exists.';
    } else if (error.name === 'ValidationError') {
        statusCode = 400;
        message = 'Data validation failed.';
    } else if (error.name === 'CastError') {
        statusCode = 400;
        message = 'Invalid value provided.';
    } else if (error.type === 'entity.parse.failed') {
        statusCode = 400;
        message = 'Invalid JSON request body.';
    } else if (error.type === 'entity.too.large') {
        statusCode = 413;
        message = 'Request body is too large.';
    } else if (error instanceof ApiError) {
        statusCode = error.statusCode;
        message = error.message;
        details = error.details;
    }

    if (statusCode >= 500) {
        logger.error(error);
    }

    res.status(statusCode).json({
        success: false,
        message,
        ...(details === undefined ? {} : { details }),
    });
};

export default errorHandler;
