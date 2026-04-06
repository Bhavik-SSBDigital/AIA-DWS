import React, { useEffect, useRef, useState } from 'react';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import {
  DeleteFile,
  GenerateDocumentName,
  GetWorkflows,
  getTemplatesByTag,
  ProcessInitiate,
  uploadDocumentInProcess,
  useTemplateDocument,
  ViewDocument,
  extractEMLDetails,
} from '../../common/Apis';
import { upload } from '../../components/drop-file-input/FileUploadDownload';
import Show from '../workflows/Show';
import apiClient from '../../common/Apis';
import { toast } from 'react-toastify';
import {
  IconInfoCircle,
  IconX,
  IconChevronDown,
  IconChevronUp,
  IconMail,
  IconEye,
  IconPaperclip,
  IconFileText,
  IconUser,
  IconClock,
  IconTrash,
  IconUpload,
  IconTemplate,
  IconMessages,
  IconAlertCircle,
  IconCircleCheck,
} from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import CustomButton from '../../CustomComponents/CustomButton';
import TopLoader from '../../common/Loader/TopLoader';
import ViewFile from '../view/View';
import CustomCard from '../../CustomComponents/CustomCard';
import Title from '../../CustomComponents/Title';
import EmailThreadModal from './EmailThreadModal';
import CustomModal from '../../CustomComponents/CustomModal';

export default function InitiateProcess() {
  const navigate = useNavigate();
  const [workflowData, setWorkflowData] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [fileMetas, setFileMetas] = useState(new Map());
  const [currentUploadingIndex, setCurrentUploadingIndex] = useState(-1);

  const [newTag, setNewTag] = useState('');
  const [templates, setTemplates] = useState([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [fileView, setFileView] = useState(null);

  const [emailThreads, setEmailThreads] = useState([]);
  const [showEmailThreadModal, setShowEmailThreadModal] = useState(false);
  const [selectedEmailThread, setSelectedEmailThread] = useState(null);
  const [isExtractingEmail, setIsExtractingEmail] = useState(false);
  const [removeEmailThredModel, setRemoveEmailThredModel] = useState('');

  const defaultvalues = {
    workflowId: '',
    description: '',
    processTagId: '',
    documents: [],
    issueNo: '',
  };

  const {
    control,
    handleSubmit,
    register,
    setValue,
    getValues,
    watch,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: defaultvalues,
  });

  const [workflowId, processTagId] = watch(['workflowId', 'processTagId']);

  const {
    fields: documentFields,
    append: addDocument,
    remove: removeDocument,
  } = useFieldArray({ control, name: 'documents' });

  const handleDeleteDocument = async (index, id) => {
    setActionsLoading(true);
    try {
      const response = await DeleteFile(id);
      toast.success(response?.data?.message);
      removeDocument(index);
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message
      );
    } finally {
      setActionsLoading(false);
    }
  };

  useEffect(() => {
    const getWorkflowsData = async () => {
      try {
        const response = await GetWorkflows();
        const workflows = response?.data?.workflows || [];
        setWorkflowData(workflows);

        if (workflows.length > 0) {
          const firstWorkflow = workflows[0];
          setSelectedWorkflow(firstWorkflow);

          if (firstWorkflow.versions?.length > 0) {
            setValue('workflowId', firstWorkflow.versions[0].id, {
              shouldValidate: true,
            });
          }
        }
      } catch (error) {
        // console.log(error);
      }
    };

    getWorkflowsData();
  }, [setValue]);

  useEffect(() => {
    if (selectedWorkflow?.versions?.length > 0) {
      const current = getValues('workflowId');
      const exists = selectedWorkflow.versions.some((v) => v.id === current);

      if (!current || !exists) {
        setValue('workflowId', selectedWorkflow.versions[0].id, {
          shouldValidate: true,
        });
      }
    }
  }, [selectedWorkflow, setValue, getValues]);

  const [allTags, setAllTags] = useState([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const fetchTags = async () => {
      try {
        const { data } = await apiClient.get('/tags');
        setAllTags(data);
      } catch (e) {
        console.error(e);
      }
    };
    fetchTags();
  }, []);

  useEffect(() => {
    if (processTagId) {
      const getTemplates = async () => {
        try {
          const res = await getTemplatesByTag(processTagId);
          setTemplates(res.data.templates);
        } catch (error) {
          console.error(error?.response?.data?.message || error?.message);
        }
      };
      getTemplates();
    } else {
      setTemplates([]);
    }
  }, [processTagId]);

  const inputRef = useRef(null);
  const handleFileChange = (e) => {
    if (!e.target.files) return;

    const newFiles = Array.from(e.target.files);
    setSelectedFiles((prev) => [...prev, ...newFiles]);

    newFiles.forEach((file) => {
      const uniqueKey = `${file.name}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      setFileMetas((prevMap) => {
        const newMap = new Map(prevMap);
        newMap.set(uniqueKey, {
          fileDescription: '',
          issueNo: '',
          preApproved: false,
          customName: '',
        });
        return newMap;
      });
    });

    if (inputRef.current) inputRef.current.value = '';
  };

  const removeFile = (index, key) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setFileMetas((prev) => {
      const copy = new Map(prev);
      copy.delete(key);
      return copy;
    });
  };

  const updateMeta = (key, updates) => {
    setFileMetas((prev) => {
      const copy = new Map(prev);
      const current = copy.get(key);
      if (current) {
        copy.set(key, { ...current, ...updates });
      }
      return copy;
    });
  };

  const handleEMLExtraction = async (documentId, parentMeta) => {
    setIsExtractingEmail(true);
    try {
      const response = await extractEMLDetails(documentId, workflowId);

      if (response.data.success) {
        const data = response.data.data;
        let emails = data.emails || [];

        const newThread = {
          id: `thread-${Date.now()}`,
          originalDocumentId: documentId,
          threadText: data.threadText || 'Email thread extracted',
          emails,
          attachmentsMapping: data.attachmentsMapping || [],
          extractedAt: new Date().toISOString(),
        };

        setEmailThreads((prev) => [...prev, newThread]);

        if (data.attachmentsMapping?.length > 0) {
          data.attachmentsMapping.forEach((att) => {
            if (att.isThreadContext) {
              addDocument({
                documentId: att.documentId,
                name: att.originalFilename,
                tags: ['email-thread-context'],
                description: att.description,
                fromEmail: false,
                partNumber: parentMeta.partNumber || '',
                preApproved: parentMeta.preApproved || false,
                issueNo: parentMeta.issueNo || '',
              });
            } else {
              addDocument({
                documentId: att.documentId,
                name: att.originalFilename,
                tags: ['extracted-from-email'],
                description: `Extracted from email: ${emails[0]?.subject || 'Unknown'}`,
                fromEmail: true,
                emailSubject: emails[0]?.subject || '',
                emailFrom: emails[0]?.from || '',
                partNumber: parentMeta.partNumber || '',
                preApproved: parentMeta.preApproved || false,
                issueNo: parentMeta.issueNo || '',
              });
            }
          });

          const attachmentCount = data.attachmentsMapping.filter(
            (a) => !a.isThreadContext
          ).length;
          toast.success(
            `Email extracted! ${attachmentCount} attachment(s) + thread context PDF added.`
          );
        } else {
          toast.info('Email extracted successfully (No attachments).');
        }

        return data;
      } else {
        toast.error('Failed to extract email: ' + response.data.message);
        return null;
      }
    } catch (error) {
      console.error('EML extraction error:', error);
      toast.error(error?.response?.data?.message || 'Failed to extract email.');
      return null;
    } finally {
      setIsExtractingEmail(false);
    }
  };

  const handleUploadAll = async () => {
    if (selectedFiles.length === 0 || !workflowId) {
      toast.info('Please select files and a workflow.');
      return;
    }

    setActionsLoading(true);
    let successCount = 0;

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const key = Array.from(fileMetas.keys())[i];
      const meta = fileMetas.get(key);

      setCurrentUploadingIndex(i);

      try {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const isEmailFile = ['eml', 'msg', 'email'].includes(ext);

        const documentNameResult = meta.preApproved
          ? { data: { documentName: `${meta.customName || file.name}.${ext}` } }
          : await GenerateDocumentName(workflowId, null, ext);

        const uploadedIds = await uploadDocumentInProcess(
          [file],
          documentNameResult?.data?.documentName,
          []
        );

        const docId = uploadedIds[0];

        if (isEmailFile) {
          toast.info(
            `Processing email file (${file.name})...`
          );

          const extractedData = await handleEMLExtraction(docId, meta);

          if (extractedData && extractedData.threadContextPdfId) {
            successCount++;
          } else {
            toast.warn('Extraction completed with warnings');
            successCount++;
          }
        } else {
          addDocument({
            documentId: docId,
            name: documentNameResult?.data?.documentName,
            tags: [],
            description: meta.fileDescription,
            partNumber: '',
            preApproved: meta.preApproved,
            issueNo: meta.issueNo,
            fromEmail: false,
          });
          successCount++;
        }
      } catch (err) {
        toast.error(
          `Failed to upload ${file.name}: ${
            err?.response?.data?.message || err.message
          }`
        );
      }
    }

    toast.success(
      `Successfully processed ${successCount}/${selectedFiles.length} file(s)`
    );

    setSelectedFiles([]);
    setFileMetas(new Map());
    setActionsLoading(false);
    setCurrentUploadingIndex(-1);
  };

  const onSubmit = async (data) => {
    if (data?.documents?.length === 0) {
      toast.info('Please upload documents for process');
      return;
    }

    const selectedTagObj = allTags.find((t) => t.id === parseInt(data.processTagId));

    const submitData = {
      ...data,
      tag: selectedTagObj ? selectedTagObj.name : '',
      emailThreads: emailThreads.map((thread) => ({
        threadText: thread.threadText || 'Email thread extracted',
        emails: thread.emails || [],
        attachmentsMapping: thread.attachmentsMapping || [],
        extractedAt: thread.extractedAt,
      })),
    };

    setActionsLoading(true);
    try {
      const res = await ProcessInitiate(submitData);
      toast.success(res?.data?.message);
      navigate('/processes/work');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
    }
  };

  const handleUseTemplate = async (template) => {
    if (!workflowId) {
      toast.error('Please select a Target Workflow before using a template.');
      return;
    }

    setActionsLoading(true);
    try {
      const res = await useTemplateDocument({
        workflowId: workflowId,
        templateId: template?.id,
      });
      toast.success(res?.data?.message);
      addDocument({
        documentId: res?.data?.documentId,
        name: res?.data?.documentName,
        tags: [],
        documentPath: res?.data?.documentPath,
        info: 'Template document - edit as needed before submission.',
      });
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    } finally {
      setActionsLoading(false);
    }
  };

  const handleViewFile = async (name, path, fileId, type, editing) => {
    setActionsLoading(true);
    try {
      const fileData = await ViewDocument(name, path, type, fileId, editing);
      setFileView(fileData);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
    }
  };

  const handleViewEmailThread = (thread) => {
    setSelectedEmailThread(thread);
    setShowEmailThreadModal(true);
  };

  const handleremoveEmailThread = (threadId) => {
    const thread = emailThreads.find((t) => t.id === threadId);

    setEmailThreads((prev) => prev.filter((t) => t.id !== threadId));

    if (thread.attachmentsMapping?.length > 0) {
      thread.attachmentsMapping.forEach((att) => {
        const index = documentFields.findIndex(
          (doc) => doc.documentId === att.documentId
        );
        if (index !== -1) {
          removeDocument(index);
        }
      });
    }

    toast.info('Email thread and associated documents removed');
  };

  const formatDate = (date) => {
    if (!date) return 'Recently';
    const now = new Date();
    const emailDate = new Date(date);
    const diffTime = Math.abs(now - emailDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays}d ago`;
    return emailDate.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50 p-6 md:p-10">
      <CustomModal
        isOpen={!!removeEmailThredModel}
        onClose={() => setRemoveEmailThredModel('')}
        size="md"
      >
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-red-50 text-red-600 rounded-full border border-red-200">
              <IconTrash size={28} stroke={1.5} />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Remove Email Thread</h2>
          </div>
          <p className="text-slate-600 mb-6">
            This will remove the email thread and all associated attachments from
            the current process.
          </p>
          <div className="flex justify-end gap-3">
            <button
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
              onClick={() => setRemoveEmailThredModel('')}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
              onClick={() => {
                handleremoveEmailThread(removeEmailThredModel);
                setRemoveEmailThredModel('');
              }}
            >
              Confirm Delete
            </button>
          </div>
        </div>
      </CustomModal>

      {actionsLoading || isExtractingEmail ? <TopLoader /> : null}

      <div className="max-w-7xl mx-auto space-y-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900">Initiate Process</h1>
          <p className="text-slate-600 mt-2">
            Configure workflow parameters and attach supporting documentation. Email
            files (.eml, .msg) are automatically processed and extracted.
          </p>
        </div>

        <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
          {/* Configuration Section */}
          <div
            className={`grid grid-cols-1 lg:grid-cols-12 gap-6 ${
              templates?.length > 0 ? '' : ''
            }`}
          >
            <div
              className={`flex flex-col gap-6 ${
                templates?.length > 0 ? 'lg:col-span-8' : 'lg:col-span-12'
              }`}
            >
              <div className="bg-white/80 backdrop-blur border border-slate-200 rounded-xl shadow-sm overflow-hidden flex-grow flex flex-col">
                <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-blue-50 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                    Process Configuration
                  </h3>
                </div>
                <div className="p-6 flex flex-col gap-6 flex-grow">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-800 mb-2">
                        Target Workflow
                      </label>
                      <select
                        className="w-full bg-white border border-slate-300 text-slate-900 text-sm p-3 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                        value={selectedWorkflow?.name || ''}
                        onChange={(e) => {
                          const selected = workflowData.find(
                            (wf) => wf.name === e.target.value
                          );
                          setSelectedWorkflow(selected);
                        }}
                      >
                        <option value="">Select a Workflow</option>
                        {workflowData.map((wf) => (
                          <option key={wf.name} value={wf.name}>
                            {wf.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-800 mb-2">
                        Process Tag
                      </label>
                      <select
                        {...register('processTagId', {
                          required: 'Process Tag is required',
                        })}
                        className="w-full bg-white border border-slate-300 text-slate-900 text-sm p-3 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                      >
                        <option value="">Select a Tag</option>
                        {allTags.map((tag) => (
                          <option key={tag.id} value={tag.id}>
                            {tag.name}
                          </option>
                        ))}
                      </select>

                      {errors.processTagId && (
                        <p className="text-red-500 text-sm mt-1.5">
                          {errors.processTagId.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex-grow flex flex-col">
                    <label className="block text-sm font-semibold text-slate-800 mb-2">
                      Process Description
                    </label>
                    <textarea
                      {...register('description', {
                        required: 'Description is required',
                      })}
                      className="w-full flex-grow bg-white border border-slate-300 text-slate-900 text-sm p-4 min-h-[250px] rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors resize-y"
                      placeholder="Enter process context and objectives. You can paste email threads here..."
                    />
                    {errors.description && (
                      <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
                        <IconInfoCircle size={14} /> {errors.description.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Templates Section */}
            {templates?.length > 0 && (
              <div className="lg:col-span-4">
                <div className="bg-white/80 backdrop-blur border border-slate-200 rounded-xl shadow-sm overflow-hidden h-full flex flex-col">
                  <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-blue-50 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                      Templates
                    </h3>
                    <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded border border-indigo-200">
                      {templates.length}
                    </span>
                  </div>
                  <div className="p-6 overflow-y-auto max-h-[350px] space-y-3">
                    {templates.map((template) => (
                      <div
                        key={template.id}
                        className="flex flex-col justify-between p-4 border border-slate-200 rounded-lg hover:border-indigo-300 hover:shadow-md transition-all bg-white"
                      >
                        <div className="flex items-start gap-3 mb-3">
                          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-md flex-shrink-0">
                            <IconFileText size={20} stroke={1.5} />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-semibold text-slate-900 text-sm truncate">
                              {template.name}
                            </h4>
                            <p className="text-xs text-slate-500 truncate mt-1">
                              {template.path}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={actionsLoading}
                          onClick={() => handleUseTemplate(template)}
                          className="w-full px-3 py-2 text-sm font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200"
                        >
                          Use Template
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Document Upload Section */}
          <div className="bg-white/80 backdrop-blur border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-blue-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Document Upload
              </h3>
              <span className="text-xs font-bold text-green-700 bg-green-50 px-3 py-1 rounded border border-green-200 flex items-center gap-1.5">
                <IconCircleCheck size={14} stroke={2} />
                Auto-Extract Emails
              </span>
            </div>

            <div className="p-6">
              <label className="flex flex-col items-center justify-center w-full py-12 border-2 border-dashed border-slate-300 rounded-xl bg-gradient-to-b from-blue-50/50 to-slate-50 hover:bg-blue-50 hover:border-indigo-400 transition-all cursor-pointer group">
                <div className="p-4 bg-white shadow-md border border-slate-200 text-slate-400 rounded-full mb-3 group-hover:text-indigo-600 transition-colors">
                  <IconUpload size={28} stroke={1.5} />
                </div>
                <h4 className="text-sm font-bold text-slate-800 mb-1">
                  Click or drag to upload files
                </h4>
                <p className="text-xs text-slate-500 text-center">
                  PDF, DOCX, XLSX, ZIP, EML, MSG
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.zip,.rar,.eml,.msg"
                />
              </label>

              {selectedFiles.length > 0 && (
                <div className="mt-6 border border-slate-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-100 sticky top-0 z-10">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">
                            File
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase w-[35%]">
                            Description
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase w-32">
                            Version
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-bold text-slate-700 uppercase">
                            Pre-Approved
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-bold text-slate-700 uppercase">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {selectedFiles.map((file, idx) => {
                          const key = Array.from(fileMetas.keys())[idx];
                          const meta = fileMetas.get(key) || {};
                          const ext = file.name.split('.').pop()?.toLowerCase() || '';
                          const isEmail = ['eml', 'msg', 'email'].includes(ext);
                          const isUploading =
                            currentUploadingIndex === idx && actionsLoading;

                          return (
                            <tr
                              key={key}
                              className="hover:bg-slate-50 transition-colors"
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="text-slate-400">
                                    <IconPaperclip size={18} stroke={1.5} />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className="text-sm font-semibold text-slate-900 truncate max-w-[180px]"
                                        title={file.name}
                                      >
                                        {file.name}
                                      </span>
                                      {isEmail && (
                                        <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded bg-indigo-100 text-indigo-700 border border-indigo-200 flex-shrink-0">
                                          Email
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">
                                      {(file.size / 1024).toFixed(1)} KB
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td className="px-4 py-3">
                                <input
                                  type="text"
                                  value={meta.fileDescription || ''}
                                  onChange={(e) =>
                                    updateMeta(key, {
                                      fileDescription: e.target.value,
                                    })
                                  }
                                  placeholder="Optional description..."
                                  className="w-full bg-white border border-slate-300 focus:border-indigo-500 rounded-md px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                                  disabled={actionsLoading}
                                />
                              </td>

                              <td className="px-4 py-3">
                                <input
                                  type="text"
                                  value={meta.issueNo || ''}
                                  onChange={(e) =>
                                    updateMeta(key, { issueNo: e.target.value })
                                  }
                                  placeholder="v1.0"
                                  className="w-full bg-white border border-slate-300 focus:border-indigo-500 rounded-md px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
                                  disabled={actionsLoading}
                                />
                              </td>

                              <td className="px-4 py-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={!!meta.preApproved}
                                  onChange={(e) =>
                                    updateMeta(key, {
                                      preApproved: e.target.checked,
                                    })
                                  }
                                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                                  disabled={actionsLoading}
                                />
                              </td>

                              <td className="px-4 py-3 text-center">
                                {isUploading ? (
                                  <span className="text-indigo-600 text-xs font-bold">
                                    Processing...
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => removeFile(idx, key)}
                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                    disabled={actionsLoading}
                                  >
                                    <IconTrash size={18} stroke={1.5} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-slate-100 border-t border-slate-200 p-3 flex justify-end">
                    <button
                      type="button"
                      onClick={handleUploadAll}
                      disabled={actionsLoading || !workflowId}
                      className={`px-6 py-2.5 text-sm font-bold rounded-lg text-white shadow-md transition-all ${
                        actionsLoading || !workflowId
                          ? 'bg-slate-400 cursor-not-allowed'
                          : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg'
                      }`}
                    >
                      {actionsLoading
                        ? `Processing ${currentUploadingIndex + 1}/${selectedFiles.length}...`
                        : `Upload ${selectedFiles.length} File(s)`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Email Threads Section */}
          {emailThreads?.length > 0 && (
            <div className="bg-white/80 backdrop-blur border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-blue-50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <IconMessages size={18} stroke={1.5} />
                  Parsed Email Threads
                </h3>
                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded border border-indigo-200">
                  {emailThreads.length} Thread(s)
                </span>
              </div>
              <div className="p-6 overflow-y-auto max-h-[400px]">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {emailThreads.map((thread) => (
                    <div
                      key={thread.id}
                      className="group flex flex-col bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:shadow-lg transition-all overflow-hidden"
                    >
                      <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className="mt-0.5 text-indigo-500 flex-shrink-0">
                            <IconMessages size={20} stroke={1.5} />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-semibold text-slate-900 text-sm truncate mb-1">
                              {thread.emails?.[0]?.subject ||
                                'Email Conversation'}
                            </h4>
                            <p className="text-xs text-slate-500 truncate">
                              From: {thread.emails?.[0]?.from || 'Unknown'}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="text-slate-400 hover:text-red-600 p-1.5 rounded transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                          onClick={() => setRemoveEmailThredModel(thread.id)}
                        >
                          <IconTrash size={18} stroke={1.5} />
                        </button>
                      </div>

                      <div className="bg-slate-50/50 p-4 flex-grow flex flex-col justify-center gap-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-600 font-medium">Files</span>
                          <span className="font-bold text-slate-800 flex items-center gap-1.5">
                            <IconPaperclip size={14} className="text-indigo-500" />
                            {thread.attachmentsMapping?.length || 0}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-600 font-medium">Extracted</span>
                          <span className="text-slate-800 font-medium">
                            {formatDate(thread.extractedAt)}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleViewEmailThread(thread)}
                        className="w-full py-2.5 text-xs font-bold text-indigo-700 bg-indigo-50 border-t border-slate-100 hover:bg-indigo-100 transition-colors flex items-center justify-center gap-1.5"
                        disabled={actionsLoading}
                      >
                        <IconEye size={16} stroke={1.5} />
                        View Thread
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Committed Documents Section */}
          <div className="bg-white/80 backdrop-blur border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-blue-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Committed Documents
              </h3>
              <span className="text-xs font-bold text-slate-700 bg-slate-200 px-3 py-1 rounded border border-slate-300">
                {documentFields.length} File(s)
              </span>
            </div>

            <div className="p-6 overflow-y-auto max-h-[400px]">
              {documentFields.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg">
                  <IconAlertCircle
                    className="text-slate-400 mx-auto mb-3"
                    size={32}
                    stroke={1.5}
                  />
                  <p className="text-sm text-slate-600 font-medium">
                    No documents yet. Upload files to get started.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {documentFields.map((doc, index) => (
                    <div
                      key={doc.documentId || index}
                      className={`p-4 bg-white border rounded-lg shadow-sm flex flex-col gap-3 relative overflow-hidden hover:shadow-md transition-all ${
                        doc.fromEmail ? 'border-indigo-200' : 'border-slate-200'
                      }`}
                    >
                      <div
                        className={`absolute left-0 top-0 bottom-0 w-1 ${
                          doc.fromEmail ? 'bg-indigo-500' : 'bg-slate-400'
                        }`}
                      ></div>

                      <div className="flex items-start gap-3 pl-2">
                        <div
                          className={`mt-0.5 ${
                            doc.fromEmail
                              ? 'text-indigo-500'
                              : 'text-slate-500'
                          }`}
                        >
                          {doc.fromEmail ? (
                            <IconMail size={20} stroke={1.5} />
                          ) : (
                            <IconFileText size={20} stroke={1.5} />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4
                            className="text-sm font-bold text-slate-900 truncate mb-2"
                            title={doc.name}
                          >
                            {doc.name || 'Unnamed'}
                          </h4>

                          {doc.fromEmail && (
                            <span className="inline-block px-2 py-1 text-[10px] font-bold bg-indigo-50 text-indigo-700 rounded border border-indigo-200 mb-2">
                              From Email
                            </span>
                          )}

                          <div className="text-xs text-slate-500 mb-2 font-mono">
                            ID: {doc.documentId}
                          </div>

                          {doc.description && (
                            <p className="text-xs text-slate-700 bg-slate-50 p-2 rounded border border-slate-200 mb-2">
                              {doc.description}
                            </p>
                          )}

                          {doc.info && (
                            <p className="text-xs text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                              {doc.info}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-end gap-2 pl-2">
                        <button
                          type="button"
                          disabled={actionsLoading}
                          onClick={() =>
                            handleViewFile(
                              doc.name,
                              doc.documentPath || '/check',
                              doc.documentId,
                              doc.name?.split('.').pop(),
                              true
                            )
                          }
                          className="px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded transition-colors"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          disabled={actionsLoading}
                          onClick={() =>
                            handleDeleteDocument(index, doc.documentId)
                          }
                          className="px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={handleSubmit(onSubmit)}
              disabled={
                actionsLoading ||
                isExtractingEmail ||
                documentFields.length === 0
              }
              className={`px-10 py-3 rounded-lg font-bold text-base text-white shadow-lg transition-all ${
                actionsLoading ||
                isExtractingEmail ||
                documentFields.length === 0
                  ? 'bg-slate-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-xl'
              }`}
            >
              {actionsLoading ? 'Processing...' : 'Initiate Process'}
            </button>
          </div>
        </form>
      </div>

      {fileView && (
        <ViewFile
          docu={fileView}
          setFileView={setFileView}
          handleViewClose={() => setFileView(null)}
        />
      )}

      {showEmailThreadModal && selectedEmailThread && (
        <EmailThreadModal
          thread={selectedEmailThread}
          onClose={() => {
            setShowEmailThreadModal(false);
            setSelectedEmailThread(null);
          }}
          onViewDocument={handleViewFile}
        />
      )}
    </div>
  );
}