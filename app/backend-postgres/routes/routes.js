import express from "express";
import upload_, {
  mergePdfUpload,
  uploadMemory,
} from "../config/multer-config.js";
import multer from "multer";
import rateLimit from "express-rate-limit";

// ✅ IMPORT BOTH AUTH AND ADMIN MIDDLEWARE
import { requireAuth, requireAdmin } from "../utility/verifyUser.js";

import { extractEMLDetails } from "../controller/eml-extract-controller.js";
import {
  sign_up,
  login,
  create_admin,
  change_password,
  logout,
  download_login_logs,
  autoLogin,
  validateAutoLogin,
  forget_password,
} from "../controller/auth-controller.js";
import {
  getEmailRecipients,
  getSentEmails,
  addEmailRecipients,
  removeEmailRecipient,
  sendManualEmail,
  getAllUniqueEmails,
} from "../controller/email-controller.js";
import {
  add_department,
  deactivate_department,
  get_department,
  get_departments,
  getDepartmentsHierarchy,
} from "../controller/department-controller.js";
import {
  add_workflow,
  edit_workflow,
  check_if_workflow_is_duplicate,
  view_workflow,
  delete_workflow,
  get_workflows,
  get_workflow_templates,
  get_workflow_steps_with_assignments,
  get_all_workflows_with_basics,
} from "../controller/workflow-controller.js";
import {
  getDocumentDetailsOnTheBasisOfPath,
  create_permissions,
  getDocumentDetailsForAdmin,
  getDocumentDetailsOnTheBasisOfPathForEdit,
  getDocumentChildren,
  search_documents,
  get_searches,
  delete_search,
} from "../controller/file-details-controller.js";
import {
  sign_document,
  revoke_sign,
  reject_document,
  revoke_rejection,
  sign_documents,
} from "../controller/e-sign-controller.js";
import {
  file_upload,
  file_download,
  create_folder,
  mergeFilesToPdf,
  mergeAndSavePdf,
  folder_download,
  file_copy,
  file_cut,
  file_delete,
  file_though_url,
  get_file_data,
  delete_file,
  recover_from_recycle_bin,
  archive_file,
  unarchive_file,
  wopiDiscovery,
  checkCollaboraCapabilities,
  wopiFiles,
  getWopiToken,
  wopiFileContents,
  wopiFilePost,
  checkHostingDiscovery,
  wopiLock,
  wopiUnlock,
  wopiRefreshLock,
  downloadWatermarkedFile,
  bookmark_document,
  get_bookmarked_documents,
  remove_bookmark_document,
  download_converted_signed_pdf,
} from "../controller/file-controller.js";
import {
  getRootDocumentsWithAccess,
  getRootDocumentsForEdit,
} from "../controller/project-controller.js";
import {
  add_role,
  get_role,
  edit_role,
  get_roles,
  getRolesHierarchyInDepartment,
  deactivate_role,
} from "../controller/role-controller.js";
import {
  deactivate_user,
  edit_user,
  get_user,
  get_user_dsc,
  get_user_profile_data,
  get_user_profile_pic,
  get_user_signature,
  get_user_signature_id,
  get_users,
  get_users_with_details,
} from "../controller/user-controller.js";
import {
  complete_process_step,
  get_user_processes,
  initiate_process,
  view_process,
  createQuery,
  createRecommendation,
  submitRecommendationResponse,
  get_recommendation,
  get_recommendations,
  signAsRecommender,
  get_completed_initiator_processes,
  reopen_process,
  generateDocumentNameController,
  get_process_documents,
  upload_documents_in_process,
  delete_document_in_process,
  attach_po_numbers,
} from "../controller/process-controller.js";
import { pick_process_step } from "../controller/process-step-claim.js";
import { upload_signature } from "../controller/image-controller.js";
import {
  get_user_activity_logs,
  get_user_activity_log,
  get_process_activity_logs,
} from "../controller/log-controller.js";
import {
  getNumbers,
  getDetails,
  getWorkflowAnalysis,
} from "../controller/dashboard-controller.js";
import {
  add_request_message,
  create_physical_request,
  get_physical_request_messages,
  get_physical_requests,
  update_physical_request,
} from "../controller/doc-tracking-controller.js";
import { export_file_logs } from "../controller/file-operation-handler.js";
import {
  add_tags,
  get_tags,
  update_tag,
  delete_tag,
  create_template_document,
  upload_template_document,
  use_template_document,
  get_templates_by_tag,
  download_template_document,
} from "../controller/tag-controller.js";

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    message:
      "Too many login attempts from this IP, please try again after 15 minutes",
  },
});

// ==========================================
// 🔓 PUBLIC ROUTES (No Token Required)
// ==========================================
router.post("/login", loginLimiter, login);
router.get("/auto-login", autoLogin);
router.post("/validate-auto-login", validateAutoLogin);
router.post("/forgetPassword", loginLimiter, forget_password);
router.post("/changePassword", change_password);
router.get("/files/:filePath(*)", file_though_url);

// WOPI endpoints
router.get("/wopi/discovery", wopiDiscovery);
router.get("/hosting/discovery", checkHostingDiscovery);
router.get("/collabora/capabilities", checkCollaboraCapabilities);
router.get("/wopi/files/:fileId", wopiFiles);
router.post("/wopi/files/:fileId", (req, res) => res.status(200).send());
router.get("/wopi/files/:id/contents", wopiFileContents);
router.post("/wopi/files/:fileId/contents", wopiFilePost);
router.post("/wopi/files/:fileId/lock", wopiLock);
router.post("/wopi/files/:fileId/unlock", wopiUnlock);
router.post("/wopi/files/:fileId/refreshlock", wopiRefreshLock);
router.post("/wopi/token/:fileId", getWopiToken);

// ==========================================
// 🛡️ SECURITY HEADERS MIDDLEWARE
// ==========================================
router.use((req, res, next) => {
  res.removeHeader("X-Powered-By");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  next();
});

// ==========================================
// 🔒 GLOBAL AUTHENTICATION GATEWAY
// ==========================================
router.use(requireAuth);

// ==========================================
// 👑 ADMIN-ONLY ROUTES
// ==========================================
// Users
router.post("/signup", requireAdmin, sign_up);
router.post("/createAdmin", requireAdmin, create_admin);
router.post("/deleteUser/:id", requireAdmin, deactivate_user);

router.get("/process/email-recipients/:processId", getEmailRecipients);
router.post("/process/email-recipients/:processId", addEmailRecipients);
router.get("/process/unique-emails", getAllUniqueEmails);
router.delete("/process/email-recipients/:processId", removeEmailRecipient);
router.get("/process/sent-emails/:processId", getSentEmails);
router.post("/process/send-email/:processId", sendManualEmail);

// Departments
router.post("/addDepartment", requireAdmin, add_department);
router.delete("/deleteDepartment/:id", requireAdmin, deactivate_department);

// Roles
router.post("/addRole", requireAdmin, add_role);
router.put("/editRole/:id", requireAdmin, edit_role);
router.delete("/deleteRole/:id", requireAdmin, deactivate_role);

// Admin Logs & Permissions
router.get("/downloadLoginLogs", requireAdmin, download_login_logs);
router.get("/exportFileLogs", requireAdmin, export_file_logs);
router.post("/createPermissions", requireAdmin, create_permissions);

// ✅ FIXED: Missing requireAdmin on global document fetch
router.post("/getAllDocuments", requireAdmin, getDocumentDetailsForAdmin);

// ==========================================
// 🛡️ AUTHENTICATED USER ROUTES
// ==========================================
router.post("/logout", logout);

// Tags
router.post("/tags", requireAdmin, add_tags);
router.get("/tags", get_tags);
router.put("/tags/:id", requireAdmin, update_tag);
router.delete("/tags/:id", requireAdmin, delete_tag);
router.get("/getTemplatesByTag/:tagId", get_templates_by_tag);

// ✅ FIXED: Added requireAdmin to global Department & Role read routes
router.get("/getDepartments", requireAdmin, get_departments);
router.post("/getAllBranches", requireAdmin, get_departments);
router.get("/getDepartment/:id", requireAdmin, get_department);
router.get("/getDepartmentsHierarchy", requireAdmin, getDepartmentsHierarchy);
router.get("/getRoles", requireAdmin, get_roles);
router.get("/getRole/:id", requireAdmin, get_role);
router.get(
  "/getRolesHierarchyInDepartment/:departmentId",
  requireAdmin,
  getRolesHierarchyInDepartment,
);

// ✅ FIXED: Added requireAdmin to global User read routes
router.get("/getUsers", requireAdmin, get_users);
router.get("/getUsersWithDetails", get_users_with_details);

// (Allowed for standard users to fetch specific context/own data)
router.get("/getUser/:userId", requireAdmin, get_user);
router.put("/editUser/:userId", requireAdmin, edit_user); // Handled internally for self-edit vs admin-edit
router.get("/api/users/signature/:userId", get_user_signature_id);
router.get("/getUserSignature/:userId", get_user_signature);
router.post("/getUserProfilePic", get_user_profile_pic);
router.get("/getUserProfileData", get_user_profile_data);
router.get("/getUserDSC", get_user_dsc);

// Files & Folders
router.post("/upload", file_upload);
router.get("/download-template/:id", download_template_document);
router.post("/download", file_download);
router.post("/copyFile", file_copy);
router.post("/cutFile", file_cut);
router.post("/createFolder", create_folder);
router.post("/downloadFolder", folder_download);

router.get("/getFileData", get_file_data);
router.post("/accessFolder", getDocumentDetailsOnTheBasisOfPath);
router.post(
  "/getDocumentDetailsOnTheBasisOfPathForEdit",
  requireAdmin,
  getDocumentDetailsOnTheBasisOfPathForEdit,
);
router.post("/getDocumentChildren", getDocumentChildren);
router.post("/deleteFile", delete_file);
router.post("/recoverDeletedFile", recover_from_recycle_bin);
router.post("/archiveFile", archive_file);
router.post("/unarchiveFile", unarchive_file);
router.get("/searchDocuments", search_documents);
router.get("/get_searches", get_searches);
router.delete("/delete_search/:id", delete_search);

// PDF & Document Operations
router.post("/merge-pdf", mergePdfUpload, mergeFilesToPdf);
router.post("/merge-and-save", mergePdfUpload, mergeAndSavePdf);
router.post("/downloadWatermarkedFile/:documentId", downloadWatermarkedFile);
router.get(
  "/downloadConvertedSignedPdf/:processId/:documentId",
  download_converted_signed_pdf,
);
router.post("/extract-eml", extractEMLDetails);
router.post("/generateDocumentName", generateDocumentNameController);

// Workflows

router.post("/workflows/addWorkflow", requireAdmin, add_workflow);
router.put("/workflows/editWorkflow/:workflowId", requireAdmin, edit_workflow);
router.get("/workflows/viewWorkflow/:workflowId", view_workflow);
router.delete(
  "/workflows/deleteWorkflow/:workflowId",
  requireAdmin,
  delete_workflow,
);
router.get("/workflows/getWorkflows", get_workflows);
router.get(
  "/workflows/getWorkflowsList",
  requireAdmin,
  get_all_workflows_with_basics,
);
router.get(
  "/workflows/:workflowId/getSteps",
  get_workflow_steps_with_assignments,
);
router.post(
  "/workflows/checkIfDuplicateWorkflow",
  requireAdmin,
  check_if_workflow_is_duplicate,
);

router.post("/createTemplateDocument", requireAdmin, create_template_document);
router.get("/getWorkflowTemplates/:workflowId", get_workflow_templates);
router.post(
  "/upload-template",
  upload_.single("file"),
  upload_template_document,
);
router.post("/useTemplateDocument", use_template_document);

// Processes
router.post("/initiateProcess", initiate_process);
router.get("/viewProcess/:processId", view_process);
router.post("/claimProcessStep", pick_process_step);
router.post("/completeStep", complete_process_step);
router.get("/getUserProcesses", get_user_processes);
router.get("/getCompletedProcesses", get_completed_initiator_processes);
router.post("/reopenProcess", reopen_process);
router.post("/process/attach-po", attach_po_numbers);
router.get(
  "/processDocuments/:processId/:versionNumber",
  get_process_documents,
);
router.post("/uploadDocumentsInProcess", upload_documents_in_process);
router.post("/deleteDocumentInProcess", delete_document_in_process);

// Signatures & Actions
router.post("/signDocument", sign_document);
router.post("/signDocuments", sign_documents);
router.post("/revokeSign", revoke_sign);
router.post("/rejectDocument", reject_document);
router.post("/revokeRejection", revoke_rejection);
router.post("/uploadSignature", upload_.single("file"), upload_signature);
router.post("/bookmarkDocument", bookmark_document);
router.get("/getBookmarkedDocuments", get_bookmarked_documents);
router.delete("/removeBookmark", remove_bookmark_document);

// Queries & Recommendations
router.post("/queries/createQuery", createQuery);
router.post("/recommendations/createRecommendation", createRecommendation);
router.post("/recommendations/signDocument", signAsRecommender);
router.post("/recommendations/respond", submitRecommendationResponse);
router.get("/recommendations/getRecommendations", get_recommendations);
router.get("/recommendations/:recommendationId", get_recommendation);

// Physical Requests
router.post("/createPhysicalRequest", create_physical_request);
router.get("/getPhysicalRequests", get_physical_requests);
router.post("/updatePhysicalRequest/:id", update_physical_request);
router.get("/getPhysicalRequestMessages/:id", get_physical_request_messages);
router.post("/addRequestMessage/:id", add_request_message);

// Projects
router.post("/getProjects", getRootDocumentsWithAccess);
router.post("/getRootDocumentsForEdit", requireAdmin, getRootDocumentsForEdit);

// Dashboards & Logs
router.get("/getNumbers", getNumbers);
router.get("/getDetails", getDetails);
router.get("/workflowAnalysis/:workflowId", getWorkflowAnalysis);
router.get("/logs/getUserLogs", get_user_activity_logs);
router.get("/logs/:processId/:stepInstanceId?", get_user_activity_log);
router.get("/getProcessActivityLogs/:processId", get_process_activity_logs);

// Misc
router.get("/getHighlightsInFile/:documentId", (req, res) =>
  res.status(200).json({ highlights: [] }),
);

export default router;
