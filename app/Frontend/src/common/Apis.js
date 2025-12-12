import axios from 'axios';
import {
  download,
  upload,
} from '../components/drop-file-input/FileUploadDownload';
import { toast } from 'react-toastify';

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const getAccessToken = () => sessionStorage.getItem('accessToken');

const apiClient = axios.create({
  baseURL: backendUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});
apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// general
export const LogOut = async () => {
  return apiClient.post('/logout');
};

// reports
export const downloadLoginLogoutReport = async (fromDate, toDate) => {
  return apiClient.get('/downloadLoginLogs', {
    responseType: 'blob',
    params: {
      fromDate, // optional, only sent if provided
      toDate, // optional, only sent if provided
    },
  });
};

export const exportFileLogs = async (fromDate, toDate) => {
  console.log(fromDate);
  return apiClient.get('/exportFileLogs', {
    responseType: 'blob',
    params: {
      fromDate,
      toDate,
    },
  });
};

// department endpoints
export const getDepartments = async (fromAdmin) => {
  return apiClient.get('/getdepartments', {
    params: { type: 'department', fromAdmin: fromAdmin },
  });
};
export const getRolesHierarchyInDepartment = async (id) => {
  return apiClient.get(`/getRolesHierarchyInDepartment/${id}`);
};
export const getDepartmentsHierarchy = async () => {
  return apiClient.get('/getDepartmentsHierarchy');
};
export const getDepartmentbyID = async (id) => {
  return apiClient.get(`/getDepartment/${id}`);
};
export const createDepartment = async (data) => {
  return apiClient.post(`/addDepartment`, data);
};
export const editDepartment = async (id, data) => {
  return apiClient.put(`/editDepartment/${id}`, data);
};
export const deleteDepartment = async (id) => {
  return apiClient.delete(`/deleteDepartment/${id}`);
};

// users endpoints
export const getUsers = async () => {
  return apiClient.get('/getUsers', { params: { isRootLevel: false } });
};
export const getAllUsers = async (fromAdmin) => {
  return apiClient.get('/getUsers', { params: { fromAdmin: fromAdmin } });
};
export const getRootLevelUsers = async () => {
  return apiClient.get('/getUsers', { params: { isRootLevel: true } });
};
export const CreateUser = async (data) => {
  return apiClient.post('/signup', data);
};
export const EditUser = async (id, data) => {
  return apiClient.put(`/editUser/${id}`, data);
};
export const DeleteUser = async (id) => {
  return apiClient.post(`/deleteUser/${id}`);
};
export const GetUser = async (id) => {
  return apiClient.get(`/getUser/${id}`);
};
export const GetUsersWithDetails = async () => {
  return apiClient.get('/getUsersWithDetails');
};

// roles endpoints
export const GetRoles = async (fromAdmin) => {
  return apiClient.get('/getRoles', {
    params: { isRootLevel: false, fromAdmin: fromAdmin },
  });
};
export const GetAllRoles = async () => {
  return apiClient.get('/getRoles', { params: { isRootLevel: false } });
};
export const GetRootLevelRoles = async () => {
  return apiClient.get('/getRoles', { params: { isRootLevel: true } });
};
export const GetRoleDetailsById = async (id) => {
  return apiClient.get(`/getRole/${id}`);
};
export const EditRoleById = async (id, data) => {
  return apiClient.put(`/editRole/${id}`, data);
};
export const AddRole = async (data) => {
  return apiClient.post(`/addRole`, data);
};
export const deleteRole = async (id) => {
  return apiClient.delete(`/deleteRole/${id}`);
};

// workflow endpoints
export const CreateWorkflow = async (data) => {
  return apiClient.post('/workflows/addWorkflow', data);
};
export const EditWorkflow = async (id, data) => {
  return apiClient.put(`/workflows/editWorkflow/${id}`, data);
};
export const GetWorkflows = async (fromAdmin) => {
  return apiClient.get('/workflows/getWorkflows', {
    params: { fromAdmin: fromAdmin },
  });
};
export const GetWorkflowsList = async () => {
  return apiClient.get('/workflows/getWorkflowsList');
};
export const CopyWorkflow = async (id) => {
  return apiClient.get(`/workflows/${id}/getSteps`);
};
export const deleteWorkflow = async (id) => {
  return apiClient.delete(`/workflows/deleteWorkflow/${id}`);
};

// documents apis
export const uploadDocumentInProcess = async (
  fileList,
  name,
  tags,
  storagePath,
  documentId,
) => {
  const res = storagePath
    ? await upload(fileList, storagePath, name, true, tags, documentId)
    : await upload(fileList, '../check', name, true, tags, documentId);
  return res;
};
export const uploadDocumentsInProcessFinal = async (data) => {
  const res = await apiClient.post('/uploadDocumentsInProcess', data);
  return res;
};
export const deleteDocumentInProcess = async (data) => {
  const res = await apiClient.post('/deleteDocumentInProcess', data);
  return res;
};

export const ViewDocument = async (name, path, ext, fileId, editing) => {
  const extensions = [
    'docx',
    'doc',
    'odt',
    'xlsx',
    'xls',
    'ods',
    'pptx',
    'ppt',
    'odp',
    'odg',
  ];
  if (extensions.includes(ext)) {
    return { fileId, type: ext, name, isEditing: editing, path };
  } else {
    const res = await download(name, path, true);
    return {
      isEditing: editing,
      path,
      url: res.data,
      type: ext,
      fileId,
      name,
    };
  }
};
export const RejectDocument = async (
  processId,
  documentId,
  processStepInstanceId,
  reason,
) => {
  return apiClient.post('/rejectDocument', {
    processId,
    documentId,
    processStepInstanceId,
    reason,
  });
};
export const SignDocument = async (
  processId,
  processStepInstanceId,
  documentId,
  remarks,
) => {
  return apiClient.post('/signDocument', {
    processId,
    processStepInstanceId,
    documentId,
    remarks,
  });
};
export const SignRevoke = async (processId, documentId) => {
  return apiClient.post('/revokeSign', {
    processId,
    documentId,
  });
};
export const RevokeRejection = async (processId, documentId) => {
  return apiClient.post('/revokeRejection', {
    processId,
    documentId,
  });
};
export const DownloadFolder = async (folderPath, folderName) => {
  return apiClient.post(
    '/downloadFolder',
    {
      folderPath,
      folderName,
    },
    { responseType: 'arraybuffer' },
  );
};
export const DownloadFile = async (name, path) => {
  try {
    await download(name, path);
  } catch (error) {
    toast.error(error?.response?.data?.message || error?.messsage);
  }
};
export const DownloadFileWithWaterMark = async (
  documentId,
  password,
  watermark,
) => {
  return apiClient.post(
    `/downloadWatermarkedFile/${documentId}`,
    { password, watermark },
    { responseType: 'blob' },
  );
};
export const CutPaste = async (body) => {
  return apiClient.post('/cutFile', body);
};
export const CopyPaste = async (body) => {
  return apiClient.post('/copyFile', body);
};
export const CreateFolder = async (path, isProject) => {
  return apiClient.post('/createFolder', {
    path,
    ...isProject,
  });
};
export const ArchiveFile = async (documentId) => {
  return apiClient.post(`/archiveFile`, { documentId });
};
export const DeleteFile = async (documentId) => {
  return apiClient.post(`/deleteFile`, { documentId });
};
export const GenerateDocumentName = async (
  workflowId,
  replacedDocId,
  extension,
) => {
  return apiClient.post('/generateDocumentName', {
    workflowId,
    replacedDocId,
    extension,
  });
};
export const GetDocumentsVersionWise = async (version, processId) => {
  return apiClient.get(`/processDocuments/${processId}/${version}`);
};
export const BookmarkDocument = async (documentId) => {
  return apiClient.post('/bookmarkDocument', { documentId });
};
export const GetBookmarkedDocuments = async () => {
  return apiClient.get('/getBookmarkedDocuments');
};
export const RemoveBookmark = async (documentId) => {
  return apiClient.delete('/removeBookmark', {
    data: { documentId },
  });
};

// processes endpoints
export const ProcessInitiate = async (data) => {
  return apiClient.post('/initiateProcess', data);
};
export const GetProcessesList = async () => {
  return apiClient.get('/getUserProcesses');
};
export const GetProcessData = async (id) => {
  return apiClient.get(`/viewProcess/${id}`);
};
export const CompleteProcess = async (id) => {
  return apiClient.post(`/completeStep`, { stepInstanceId: id });
};
export const ClaimProcess = async (processId, stepInstanceId) => {
  return apiClient.post('/claimProcessStep', { processId, stepInstanceId });
};
export const CreateQuery = async (data) => {
  return apiClient.post('/queries/createQuery', data);
};
export const removeProcessNotification = async (id) => {
  return apiClient.post(`/removeProcessNotification/${id}`);
};
export const GetCompletedProcessList = async () => {
  return apiClient.get(`/getCompletedProcesses`);
};
export const ReOpenProcess = async (data) => {
  return apiClient.post('/reopenProcess', data);
};
// file and folders
export const GetFolderData = async (path) => {
  return apiClient.post('/accessFolder', { path, sectionType: null });
};
export const GetRootFolders = async () => {
  return apiClient.post('/getProjects');
};

// recycle bin
export const GetBinFolderData = async (path) => {
  return apiClient.post('/accessFolder', { path, sectionType: 'inBin' });
};
export const GetBinRootFolders = async () => {
  return apiClient.post('/getProjects', { sectionType: 'inBin' });
};
export const RecoverDeletedFile = async (documentId) => {
  return apiClient.post(`/recoverDeletedFile`, { documentId });
};

// recycle bin
export const GetArchiveFolderData = async (path) => {
  return apiClient.post('/accessFolder', { path, sectionType: 'isArchived' });
};
export const GetArchiveRootFolders = async () => {
  return apiClient.post('/getProjects', { sectionTyp: 'isArchived' });
};
export const UnArchiveFile = async (documentId) => {
  return apiClient.post(`/unarchiveFile`, { documentId });
};

// profile
export const GetSignature = async () => {
  return apiClient.get('/getUserSignature', { responseType: 'blob' });
};
export const GetProfilePic = async () => {
  return apiClient.get('/getUserProfilePic', { responseType: 'blob' });
};
export const GetProfileData = async () => {
  return apiClient.get('/getUserProfileData');
};

// branches endpoints
export const getAllBranches = async () => {
  return apiClient.post('/getAllBranches');
};
export const deleteBranch = async (id) => {
  return apiClient.post(`/deleteBranch/${id}`);
};

// signin endpoints
export const signIn = async (data) => {
  return apiClient.post(`/login`, data);
};

// signUp endpoints
export const changePassword = async (data) => {
  return apiClient.post(`/changePassword`, data);
};

// viewer endpoints
export const storeSignCoordinates = async (data) => {
  return apiClient.post(`/storeSignCoordinates`, data);
};
export const removeCoordinates = async (data) => {
  return apiClient.post(`/removeCoordinates`, data);
};
export const getHighlightsInFile = async (docId) => {
  return apiClient.get(`/getHighlightsInFile/${docId}`);
};
export const getSignCoordinatesForCurrentStep = async (docId) => {
  return apiClient.post(`/getSignCoordinatesForCurrentStep/${docId}`);
};
export const postHighlightInFile = async (data) => {
  return apiClient.post(`/postHighlightInFile`, data);
};

// recommend endpoints
export const createRecommend = async (data) => {
  return apiClient.post('/recommendations/createRecommendation', data);
};
export const getRecommendations = async () => {
  return apiClient.get('/recommendations/getRecommendations');
};
export const getRecommendationDetails = async (id) => {
  return apiClient.get(`/recommendations/${id}`);
};
export const signRecommendDocument = async (data) => {
  return apiClient.post(`/recommendations/signDocument`, data);
};
export const respondRecommendation = async (data) => {
  return apiClient.post(`/recommendations/respond`, data);
};

// logs
export const GetUserLogs = async () => {
  return apiClient.get('/logs/getUserLogs');
};
export const viewLog = async (id) => {
  return apiClient.get(`/logs/${id}`);
};

// dashboard
export const getDashboardNumbers = async (startDate, endDate) => {
  return apiClient.get(`/getNumbers?startDate=${startDate}&endDate=${endDate}`);
};
export const getDashboardTables = async (startDate, endDate) => {
  return apiClient.get(`/getDetails?startDate=${startDate}&endDate=${endDate}`);
};
export const getWorkflowAnalysisDetails = async (id, startDate, endDate) => {
  return apiClient.get(
    `/workflowAnalysis/${id}?startDate=${startDate}&endDate=${endDate}`,
  );
};

// timeline
export const getTimelineData = async (id) => {
  return apiClient.get(`/getProcessActivityLogs/${id}`);
};

// notifications
export const GetNotifications = async () => {
  return apiClient.get(`/getUserProcesses`);
};

// templets
export const getWorkflowTemplates = async (workflowId) => {
  return apiClient.get(`/getWorkflowTemplates/${workflowId}`);
};

export const createTemplateDocument = async (payload) => {
  return apiClient.post('/createTemplateDocument', payload);
};

export const uploadTemplateFile = async (formData) => {
  return apiClient.post('/upload-template', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export const useTemplateDocument = async (formData) => {
  return apiClient.post('/useTemplateDocument', formData);
};

// searching
export const deepSearch = async (queryParams) => {
  return apiClient.get(`/searchDocuments?${queryParams}`);
};
export const getSearches = async () => {
  return apiClient.get(`/get_searches`);
};
export const deleteSearch = async (id) => {
  return apiClient.delete(`/delete_search/${id}`);
};

// physical document
export const createPhysicalRequest = async (data) => {
  return apiClient.post(`/createPhysicalRequest`, {
    documentId: data?.documentId,
    departmentId: data?.departmentId,
    reason: data?.reason,
  });
};

export const getPhysicalRequests = async () => {
  return apiClient.get('/getPhysicalRequests');
};

export const updatePhysicalRequest = async (id, data) => {
  return apiClient.post(`/updatePhysicalRequest/${id}`, data);
};

export const getPhysicalRequestMessages = async (id) => {
  return apiClient.get(`/getPhysicalRequestMessages/${id}`);
};
