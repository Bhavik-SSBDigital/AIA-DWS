import express from "express";
import {
  add_role,
  get_roles,
  getRolesHierarchyInDepartment,
} from "../controller/role-controller.js";
import { requireAdmin, requireStrictAdmin } from "../utility/verifyUser.js";

const router = express.Router();

router.post("/addRole", requireStrictAdmin, add_role);
router.get("/getRoles", requireAdmin, get_roles);
router.get(
  "/getRolesHierarchyInDepartment/:departmentId",
  requireAdmin,
  getRolesHierarchyInDepartment
);

export default router;
