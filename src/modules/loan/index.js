import { Router } from "express";
import authenticate from "../../middlewares/auth.js";
import loanController from "./loan.controller.js";

const router = Router();

router.use(authenticate);
router.post("/", loanController.createLoan);
router.get("/", loanController.getAllLoans);
router.get("/:id", loanController.getLoanById);
router.put("/:id", loanController.updateLoan);
router.delete("/:id", loanController.deleteLoan);

export default router;
