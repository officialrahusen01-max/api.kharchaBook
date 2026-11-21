import authRoutes from "../modules/auth/index.js";
import userRoutes from "../modules/users/index.js";
import transactionRoutes from "../modules/transactions/index.js";
import loanBookRoutes from "../modules/loan/index.js";
import adminRoutes from "../modules/admin/index.js";
import branchRoutes from "../modules/branches/index.js";
import notificationRoutes from "../modules/notifications/index.js";

const routeGroups = [
  ["/v1/auth", authRoutes],
  ["/v1/users", userRoutes],
  ["/v1/branches", branchRoutes],
  ["/v1/transactions", transactionRoutes],
  ["/v1/loanBook", loanBookRoutes],
  ["/v1/notifications", notificationRoutes],
  ["/v1/admin", adminRoutes],
];

const registerRoutes = (app) => {
  for (const [path, router] of routeGroups) {
    app.use(`/api${path}`, router);
  }
};

export default registerRoutes;
