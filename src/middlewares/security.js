import morgan from 'morgan';
import helmet from 'helmet';
import cors from 'cors';
import express from 'express';
import hpp from 'hpp';
import corsOptions from '../config/cors.js';
import apiLimiter from './rateLimiter.js';

// Express 5 creates a fresh query object on each req.query access.
const preserveQueryForHpp = (req, res, next) => {
    Object.defineProperty(req, 'query', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: req.query,
    });
    next();
};

const security = (app) => {
    app.use(morgan('tiny'));
    app.use(helmet());
    app.use(cors(corsOptions));
    app.use(apiLimiter);
    app.use(express.json({ limit: '10kb' }));
    app.use(express.urlencoded({ extended: false, limit: '10kb' }));
    app.use(preserveQueryForHpp);
    app.use(hpp());
};

export default security;
