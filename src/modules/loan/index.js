import { Router } from "express";
import authenticate from "../../middlewares/auth.js";
import loanController from "./loan.controller.js";

const router = Router();

router.use(authenticate);
router.post("/loanBook", loanController.createLoan);
router.get("/loanBook", loanController.getAllLoans);
router.get("/loanBook/:id", loanController.getLoanById);
router.put("/loanBook/:id", loanController.updateLoan);
router.delete("/loanBook/:id", loanController.deleteLoan);

export default router;
