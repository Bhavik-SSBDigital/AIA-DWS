import express from "express";

import upload_ from "../config/multer-config.js";
import multer from "multer";

import {
  sign_up,
  login,
  create_admin,
  change_password,
  logout,
  download_login_logs,
} from "../controller/auth-controller.js";

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
  create_template_document,
  get_workflow_templates,
  upload_template_document,
  use_template_document,
  get_workflow_steps_with_assignments,
  get_all_workflows_with_basics,
} from "../controller/workflow-controller.js";

// import {
//   createQuery,
//   getProcessQueries,
//   respondToQuery,
//   approveQueryDocument,
//   approveRecirculation,
//   createQueryDoubt,
//   respondToQueryDoubt,
// } from "../controller/query-controller.js";

// import {
//   requestRecommendation,
//   submitRecommendation,
//   getRecommendations,
//   getRecommendationDetails,
//   requestRecommendationClarification,
//   respondToRecommendationClarification,
//   createRecommendationDoubt,
//   respondToRecommendationDoubt,
// } from "../controller/recommendation-controller.js";

// import {
// postHighlight,
//   getHighlights,
// } from "../controller/highlight-controller.js";

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
  wopiFileGet,
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

const router = express.Router();

router.post("/signup", sign_up);
router.post("/login", login);

// backend/routes/auth.js

router.post("/createAdmin", create_admin);

router.post("/addDepartment", add_department);

// change POST to GET
router.get("/getDepartments", get_departments);

router.post("/getAllBranches", get_departments);

// all file related routes

router.post("/upload", file_upload);
router.post("/download", file_download);
router.post("/copyFile", file_copy);
router.post("/cutFile", file_cut);
router.post("/createFolder", create_folder);
router.post("/downloadFolder", folder_download);
router.get("/files/:filePath(*)", file_though_url);
router.get("/getFileData", get_file_data);

// file details related routes

router.post("/accessFolder", getDocumentDetailsOnTheBasisOfPath);

router.get("/getDepartment/:id", get_department);

router.get("/getDepartmentsHierarchy", getDepartmentsHierarchy);
router.post("/createPermissions", create_permissions);
router.post("/getAllDocuments", getDocumentDetailsForAdmin);
router.post(
  "/getDocumentDetailsOnTheBasisOfPathForEdit",
  getDocumentDetailsOnTheBasisOfPathForEdit
);
router.post("/getDocumentChildren", getDocumentChildren);

// project-controller related routes

router.post("/getProjects", getRootDocumentsWithAccess);
router.post("/getRootDocumentsForEdit", getRootDocumentsForEdit);

// role-controller related routes

router.post("/addRole", add_role);
router.get("/getRoles", get_roles);

router.get("/getRole/:id", get_role);
router.put("/editRole/:id", edit_role);
router.get(
  "/getRolesHierarchyInDepartment/:departmentId",
  getRolesHierarchyInDepartment
);

// user-controller related routes
router.get("/getUsers", get_users);
router.get("/getUser/:userId", get_user);
router.put("/editUser/:userId", edit_user);
router.get(
  "/workflows/:workflowId/getSteps",
  get_workflow_steps_with_assignments
);
router.post(
  "/workflows/checkIfDuplicateWorkflow",
  check_if_workflow_is_duplicate
);
router.post("/workflows/addWorkflow", add_workflow); // Create a new workflow
router.put("/workflows/editWorkflow/:workflowId", edit_workflow); // Edit workflow (new version)
router.get("/workflows/viewWorkflow/:workflowId", view_workflow); // View workflow details
router.delete("/workflows/deleteWorkflow/:workflowId", delete_workflow); // Delete workflow
router.get("/workflows/getWorkflows", get_workflows); // Get all workflows
router.get("/workflows/getWorkflowsList", get_all_workflows_with_basics);
router.post("/initiateProcess", initiate_process);

router.get("/viewProcess/:processId", view_process);

router.post("/claimProcessStep", pick_process_step);

router.post("/completeStep", complete_process_step);

router.get("/getUsersWithDetails", get_users_with_details);

router.get("/getUserProcesses", get_user_processes);

router.post("/changePassword", change_password);

router.post("/signDocument", sign_document);

router.post("/signDocuments", sign_documents);

router.post("/revokeSign", revoke_sign);
router.post("/rejectDocument", reject_document);
router.post("/revokeRejection", revoke_rejection);

router.get("/getUserSignature", get_user_signature);
router.post("/getUserProfilePic", get_user_profile_pic);

router.get("/getUserProfileData", get_user_profile_data);

router.get("/getUserSignature", get_user_signature);
router.get("/getUserProfilePic", get_user_profile_pic);
router.get("/getUserDSC", get_user_dsc);

router.post("/queries/createQuery", createQuery);

router.post("/recommendations/createRecommendation", createRecommendation);
router.post("/recommendations/signDocument", signAsRecommender);
router.post("/recommendations/respond", submitRecommendationResponse);
router.get("/recommendations/getRecommendations", get_recommendations);
router.get("/recommendations/:recommendationId", get_recommendation);

router.post("/bookmarkDocument", bookmark_document);
router.get("/getBookmarkedDocuments", get_bookmarked_documents);
router.delete("/removeBookmark", remove_bookmark_document);

router.get("/get_searches", get_searches);
router.delete("/delete_search/:id", delete_search);
// router.get("/queries/process/:processId", getProcessQueries);
// router.post("/queries/respond/:queryId", respondToQuery);
// router.post("/queries/documents/approve/:documentId", approveQueryDocument);
// router.post("/queries/approve-recirculation/:queryId", approveRecirculation);
// router.post("/queries/doubts/:queryId", createQueryDoubt);
// router.post("/doubts/respond/:doubtId", respondToQueryDoubt);

// // Recommendation routes
// router.post("/recommendations", requestRecommendation);
// router.post("/recommendations/submit/:recommendationId", submitRecommendation);
// router.get("/recommendations", getRecommendations);
// router.get("/recommendations/:id", getRecommendationDetails);
// router.post(
//   "/recommendations/request-clarification/:recommendationId",
//   createRecommendationDoubt
// );
// router.post(
//   "/recommendations/respond-clarification/:recommendationId",
//   respondToRecommendationDoubt
// );

// // Highlight routes
// router.post("/highlights", postHighlight);
router.get("/getHighlightsInFile/:documentId", (req, res, next) => {
  return res.status(200).json({
    highlights: [],
  });
});

router.get("/logs/getUserLogs", get_user_activity_logs);
router.get("/logs/:processId/:stepInstanceId?", get_user_activity_log);
router.get("/getProcessActivityLogs/:processId", get_process_activity_logs);

router.get("/getNumbers", getNumbers);
router.get("/getDetails", getDetails);
router.get("/workflowAnalysis/:workflowId", getWorkflowAnalysis);

router.post("/deleteFile", delete_file);
router.post("/recoverDeletedFile", recover_from_recycle_bin);
router.post("/archiveFile", archive_file);
router.post("/unarchiveFile", unarchive_file);

router.get("/wopi/discovery", wopiDiscovery);

router.get("/collabora/capabilities", checkCollaboraCapabilities);
router.post("/wopi/token/:fileId", getWopiToken);
router.get("/wopi/files/:fileId", wopiFiles);
router.post("/wopi/files/:fileId", (req, res) => {
  // Optional: log if needed
  console.log(`POST /wopi/files/${req.params.fileId} received`);
  res.status(200).send(); // Just return success
});
// router.get("/wopi/files/:fileId/contents", wopiFileGet);
router.get("/wopi/files/:id/contents", wopiFileContents);
router.post("/wopi/files/:fileId/contents", wopiFilePost);
router.get("/hosting/discovery", checkHostingDiscovery);
router.post("/wopi/files/:fileId/lock", wopiLock);
router.post("/wopi/files/:fileId/unlock", wopiUnlock);
router.post("/wopi/files/:fileId/refreshlock", wopiRefreshLock);

router.post("/createTemplateDocument", create_template_document);
router.get("/getWorkflowTemplates/:workflowId", get_workflow_templates);

router.post("/uploadSignature", upload_.single("file"), upload_signature);
// Middleware to parse form fields

// Route for file upload
// Route for file upload
// Then your route should work as is:

// First parse the form fields
router.post(
  "/upload-template",
  upload_.single("file"),
  upload_template_document
);

router.post("/useTemplateDocument", use_template_document);

router.get("/getCompletedProcesses", get_completed_initiator_processes);

router.post("/generateDocumentName", generateDocumentNameController);

router.get(
  "/processDocuments/:processId/:versionNumber",
  get_process_documents
);

router.get("/searchDocuments", search_documents);

router.post("/reopenProcess", reopen_process);

router.post("/downloadWatermarkedFile/:documentId", downloadWatermarkedFile);

router.post("/createPhysicalRequest", create_physical_request);

router.get("/getPhysicalRequests", get_physical_requests);

router.post("/updatePhysicalRequest/:id", update_physical_request);

router.get("/getPhysicalRequestMessages/:id", get_physical_request_messages);

router.post("/addRequestMessage/:id", add_request_message);

router.post("/deleteUser/:id", deactivate_user);

router.delete("/deleteRole/:id", deactivate_role);

router.delete("/deleteDepartment/:id", deactivate_department);

router.post("/logout", logout);

router.get("/downloadLoginLogs", download_login_logs);

router.get("/exportFileLogs", export_file_logs);

router.post("/uploadDocumentsInProcess", upload_documents_in_process);

router.post("/deleteDocumentInProcess", delete_document_in_process);

export default router;
