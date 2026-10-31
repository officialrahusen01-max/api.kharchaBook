import authRoutes from '../modules/auth/index.js';
import userRoutes from '../modules/users/index.js';
import accountRoutes from '../modules/accounts/index.js';
import transactionRoutes from '../modules/transactions/index.js';
import categoryRoutes from '../modules/categories/index.js';
import budgetRoutes from '../modules/budgets/index.js';
import reportRoutes from '../modules/reports/index.js';
import businessRoutes from '../modules/businesses/index.js';
import subscriptionRoutes from '../modules/subscriptions/index.js';
import aiInsightRoutes from '../modules/ai-insights/index.js';
import adminRoutes from '../modules/admin/index.js';
import branchRoutes from '../modules/branches/index.js';

const routeGroups = [
    ['/v1/auth', authRoutes],
    ['/v1/users', userRoutes],
    ['/v1/branches', branchRoutes],
    ['/v1/accounts', accountRoutes],
    ['/v1/transactions', transactionRoutes],
    ['/v1/categories', categoryRoutes],
    ['/v1/budgets', budgetRoutes],
    ['/v1/reports', reportRoutes],
    ['/v1/businesses', businessRoutes],
    ['/v1/subscriptions', subscriptionRoutes],
    ['/v1/ai-insights', aiInsightRoutes],
    ['/v1/admin', adminRoutes],
];

const registerRoutes = (app) => {
    for (const [path, router] of routeGroups) {
        app.use(`/api${path}`, router);
    }
};

export default registerRoutes;
