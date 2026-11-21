import { rateLimit } from 'express-rate-limit';

// Create one limiter per route so each endpoint keeps its own per-IP counter.
// The OTP itself is also capped at 5 guesses, so this only slows down abuse of the email sender.
const createPasswordResetLimiter = () => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many attempts. Please try again later.' },
});

export default createPasswordResetLimiter;
