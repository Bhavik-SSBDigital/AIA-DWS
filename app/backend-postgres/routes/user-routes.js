import express from "express";
import { get_users } from "../controller/user-controller.js";
import { requireAdmin } from "../utility/verifyUser.js";

const router = express.Router();

router.get("/getUsers", requireAdmin, get_users);

export default router;
