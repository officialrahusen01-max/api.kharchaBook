import express from 'express';
import swaggerUi from 'swagger-ui-express';
import registerRoutes from './routes/index.js';
import security from './middlewares/security.js';
import errorHandler from './middlewares/errorHandler.js';
import { notFound } from './middlewares/notFound.js';
import ApiResponse from './utils/ApiResponse.js';
import openApiDocument from './config/openapi.js';
import { profilePhotoDirectory } from './modules/users/profilePhoto.js';

const app = express();
app.disable('x-powered-by');
security(app);
app.use('/uploads/profile-photos', express.static(profilePhotoDirectory, {
    dotfiles: 'deny',
    fallthrough: true,
    index: false,
}));

app.get('/api-docs.json', (req, res) => {
    res.json(openApiDocument);
});

app.use(
    '/api-docs',
    (req, res, next) => {
        res.setHeader(
            'Content-Security-Policy',
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';"
        );
        next();
    },
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, { explorer: true })
);

app.get('/', (req, res) => {
    res.send('Hello, World!');
});

app.get('/health', (req, res) => {
    res.status(200).json(new ApiResponse(200, { status: 'ok' }, 'Service is healthy'));
});

registerRoutes(app);
app.use(notFound);
app.use(errorHandler);

export default app;
