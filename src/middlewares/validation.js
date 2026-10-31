import ApiError from '../utils/ApiError.js';

const requestLocations = new Set(['body', 'params', 'query']);

const validate = (schema, location = 'body') => {
    if (!requestLocations.has(location)) {
        throw new TypeError(`Unsupported request location: ${location}`);
    }

    return (req, res, next) => {
        const result = schema.safeParse(req[location]);

        if (!result.success) {
            const issues = result.error.issues.map(({ path, code, message }) => ({
                path,
                code,
                message,
            }));
            next(new ApiError(400, 'Request validation failed.', issues));
            return;
        }

        req[location] = result.data;
        next();
    };
};

export default validate;
