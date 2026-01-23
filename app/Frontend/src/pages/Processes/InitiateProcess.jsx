import React, { useEffect, useRef, useState } from 'react';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import {
  DeleteFile,
  GenerateDocumentName,
  GetWorkflows,
  getWorkflowTemplates,
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
  const [selectedFile, setSelectedFile] = useState(null);

  const formatDate = (date) => {
    const now = new Date();
    const emailDate = new Date(date);
    const diffTime = Math.abs(now - emailDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Today at ${emailDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return `Yesterday at ${emailDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays <= 7) {
      return `${diffDays} days ago`;
    }
    return emailDate.toLocaleDateString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const [fileDetails, setFileDetails] = useState({
    tags: [],
    partNumber: '',
    preApproved: false,
    fileDescription: '',
    issueNo: '',
    name: '', // added for pre-approved case
  });

  const [newTag, setNewTag] = useState('');
  const [templates, setTemplates] = useState([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [fileView, setFileView] = useState(null);

  const [emailThreads, setEmailThreads] = useState([]);
  const [showEmailThreadModal, setShowEmailThreadModal] = useState(false);
  const [selectedEmailThread, setSelectedEmailThread] = useState(null);
  const [isExtractingEmail, setIsExtractingEmail] = useState(false);

  const defaultvalues = {
    workflowId: '',
    description: '',
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

  const [workflowId] = watch(['workflowId']);

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
          error?.message,
      );
    } finally {
      setActionsLoading(false);
    }
  };

  // ────────────────────────────────────────────────
  // Auto-select first workflow and first version
  // ────────────────────────────────────────────────
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
        console.log(error);
      }
    };

    getWorkflowsData();
  }, [setValue]);

  // Auto-select first version when workflow changes (fallback / safety)
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

  const [expandedEmailThreads, setExpandedEmailThreads] = useState({});
  const [allTags, setAllTags] = useState([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const fetchTags = async () => {
      try {
        const { data } = await apiClient.get('/tags');
        setAllTags(data.map((t) => t.name.toLowerCase()));
      } catch (e) {
        console.error(e);
      }
    };
    fetchTags();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addTag = (tag) => {
    if (fileDetails.tags.includes(tag)) return;
    setFileDetails((prev) => ({
      ...prev,
      tags: [...prev.tags, tag],
    }));
    setSearch('');
    setOpen(false);
  };

  const removeTag = (tag) => {
    setFileDetails((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tag),
    }));
  };

  const filteredTags = allTags.filter(
    (tag) =>
      tag.includes(search.toLowerCase()) && !fileDetails.tags.includes(tag),
  );

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
  };

  const inputRef = useRef(null);

  const handleEMLExtraction = async (documentId) => {
    setIsExtractingEmail(true);
    try {
      const response = await extractEMLDetails(documentId, workflowId);

      if (response.data.success) {
        const data = response.data.data;
        let emails = [];

        if (Array.isArray(data.emails) && data.emails.length > 0) {
          emails = data.emails;
        } else if (data.originalEmail) {
          emails = [
            {
              subject: data.originalEmail.subject,
              from: data.originalEmail.from,
              date: data.originalEmail.date,
              bodyText: data.threadText || '',
              attachments: data.attachmentsMapping || [],
            },
          ];
        } else if (data.threadText) {
          emails = [
            {
              subject: 'Extracted Email',
              from: 'Unknown',
              date: new Date().toISOString(),
              bodyText: data.threadText,
              attachments: data.attachmentsMapping || [],
            },
          ];
        }

        const newThread = {
          id: `thread-${Date.now()}`,
          originalDocumentId: documentId,
          threadText: data.threadText || 'Email thread',
          emails,
          attachmentsMapping: data.attachmentsMapping || [],
          extractedAt: new Date().toISOString(),
        };

        setEmailThreads((prev) => [...prev, newThread]);

        if (data.extractedDocumentIds?.length > 0) {
          data.extractedDocumentIds.forEach((attDocId, idx) => {
            const attachment = data.attachmentsMapping?.[idx];
            if (attachment) {
              const emailSubject = emails[0]?.subject || 'Unknown subject';
              const emailFrom = emails[0]?.from || 'Unknown sender';

              addDocument({
                documentId: attDocId,
                name: attachment.originalFilename || `attachment_${idx}`,
                tags: [...fileDetails.tags, 'extracted-from-email'],
                description: `Extracted from email: ${emailSubject}`,
                fromEmail: true,
                emailSubject,
                emailFrom,
                partNumber: fileDetails.partNumber,
                preApproved: fileDetails.preApproved,
                issueNo: fileDetails.issueNo,
              });
            }
          });

          toast.success(
            `Email extracted! ${data.extractedDocumentIds.length} attachment(s) added.`,
          );
        } else {
          toast.info('Email extracted successfully!');
        }
      } else {
        toast.error('Failed to extract email: ' + response.data.message);
      }
    } catch (error) {
      console.error('EML extraction error:', error);
      toast.error(error?.response?.data?.message || 'Failed to extract email.');
    } finally {
      setIsExtractingEmail(false);
    }
  };

  const handleUpload = async () => {
    if (!workflowId) {
      toast.info('Please select workflow.');
      return;
    }
    if (!selectedFile) return;

    setActionsLoading(true);

    try {
      const generatedName = fileDetails.preApproved
        ? {
            data: {
              documentName: `${fileDetails.name}.${selectedFile.name.split('.').pop()}`,
            },
          }
        : await GenerateDocumentName(
            workflowId,
            null,
            selectedFile.name.split('.').pop(),
          );

      const res = await uploadDocumentInProcess(
        [selectedFile],
        generatedName?.data?.documentName,
        fileDetails?.tags,
      );

      const fileExt = selectedFile.name.split('.').pop().toLowerCase();
      const isEmailFile = ['eml', 'msg', 'email'].includes(fileExt);

      if (isEmailFile) {
        const uploadedDocumentId = res[0];
        toast.info('Email file detected. Extracting attachments...');

        setTimeout(async () => {
          await handleEMLExtraction(uploadedDocumentId);

          setFileDetails({
            tags: [],
            partNumber: '',
            preApproved: false,
            fileDescription: '',
            issueNo: '',
            name: '',
          });
          setNewTag('');
          setSelectedFile(null);
          if (inputRef.current) inputRef.current.value = null;
          setActionsLoading(false);
        }, 1000);

        return;
      }

      toast.success('File uploaded successfully');

      addDocument({
        documentId: res[0],
        name: generatedName?.data?.documentName,
        tags: fileDetails.tags,
        description: fileDetails.fileDescription,
        partNumber: fileDetails.partNumber,
        preApproved: fileDetails.preApproved,
        issueNo: fileDetails.issueNo,
        fromEmail: false,
      });

      setFileDetails({
        tags: [],
        partNumber: '',
        preApproved: false,
        fileDescription: '',
        issueNo: '',
        name: '',
      });

      setNewTag('');
      setSelectedFile(null);
      if (inputRef.current) inputRef.current.value = null;
    } catch (err) {
      console.error('Upload error:', err);
      toast.error(
        err?.response?.data?.message || err.message || 'Upload failed',
      );
    } finally {
      setActionsLoading(false);
    }
  };

  const onSubmit = async (data) => {
    if (data?.documents?.length === 0) {
      toast.info('Please upload documents for process');
      return;
    }

    const submitData = {
      ...data,
      emailThreads: emailThreads.map((thread) => ({
        threadText: thread.threadText || 'Email thread extracted from EML',
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
        info: 'This document is prepared from template document, please edit if you want to add the latest data.',
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

  // ────────────────────────────────────────────────
  // Delete thread with confirmation + remove attachments
  // ────────────────────────────────────────────────

  const [removeEmailThredModel, setRemoveEmailThredModel] = useState('');

  const handleremoveEmailThread = (threadId) => {
    const thread = emailThreads.find((t) => t.id === threadId);

    setEmailThreads((prev) => prev.filter((t) => t.id !== threadId));

    if (thread.attachmentsMapping?.length > 0) {
      thread.attachmentsMapping.forEach((att) => {
        const index = documentFields.findIndex(
          (doc) => doc.documentId === att.documentId,
        );
        if (index !== -1) {
          removeDocument(index);
        }
      });
    }

    toast.info('Email thread and associated attachments removed');
  };

  useEffect(() => {
    if (workflowId) {
      const getTemplates = async () => {
        try {
          const res = await getWorkflowTemplates(workflowId);
          setTemplates(res.data.templates);
        } catch (error) {
          console.error(error?.response?.data?.message || error?.message);
        }
      };
      getTemplates();
    }
  }, [workflowId]);

  return (
    <>
      <CustomModal
        isOpen={!!removeEmailThredModel}
        onClose={() => setRemoveEmailThredModel('')}
        size="md"
      >
        <div>
          <h2 className="text-lg font-semibold mb-4">Confirm Deletion</h2>
          <p>Are you sure you want to remove this email thread?</p>
          <div className="flex justify-end mt-4">
            <button
              className="px-4 py-2 bg-red-500 text-white rounded-md mr-2"
              onClick={() => {
                handleremoveEmailThread(removeEmailThredModel);
                setRemoveEmailThredModel('');
              }}
            >
              Confirm
            </button>
            <button
              className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md border border-gray-300"
              onClick={() => setRemoveEmailThredModel('')}
            >
              Cancel
            </button>
          </div>
        </div>
      </CustomModal>
      {actionsLoading || isExtractingEmail ? <TopLoader /> : null}
      <CustomCard className="max-w-7xl mx-auto p-6">
        <Title text={'Initiate Process'} />

        <form className="space-y-10" onSubmit={(e) => e.preventDefault()}>
          {/* Process Info Section */}
          <section className="bg-white p-6">
            <h3 className="text-xl font-semibold text-gray-700 mb-4">
              Process Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <input
                  {...register('description', {
                    required: 'Description is required',
                  })}
                  className="w-full border border-gray-300 p-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter process description"
                />
                {errors.description && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.description.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Select Workflow
                </label>
                <select
                  className="w-full border border-gray-300 p-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedWorkflow?.name || ''}
                  onChange={(e) => {
                    const selected = workflowData.find(
                      (wf) => wf.name === e.target.value,
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
                <label className="block text-sm font-medium text-gray-700">
                  Select Version
                </label>
                <Controller
                  name="workflowId"
                  control={control}
                  rules={{ required: 'Version selection is required' }}
                  render={({ field }) => (
                    <select
                      {...field}
                      className="w-full border border-gray-300 p-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={!selectedWorkflow}
                    >
                      <option value="">Select a Version</option>
                      {selectedWorkflow?.versions.map((ver) => (
                        <option key={ver.id} value={ver.id}>
                          Version {ver.version} - {ver.description}
                        </option>
                      ))}
                    </select>
                  )}
                />
                {errors.workflowId && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.workflowId.message}
                  </p>
                )}
              </div>
            </div>

            {workflowId && (
              <div className="border mt-3 w-full border-gray-400 rounded-md p-4 shadow-lg">
                <Show
                  steps={
                    selectedWorkflow?.versions?.find(
                      (item) => item.id === workflowId,
                    )?.steps
                  }
                />
              </div>
            )}
          </section>

          {/* Templates Section */}
          {templates?.length > 0 && (
            <section className="bg-white p-4 sm:p-6">
              <h3 className="text-xl font-semibold text-gray-700 mb-4">
                Templates
              </h3>
              <ul className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
                {templates.map((template) => (
                  <li
                    key={template.id}
                    className="flex flex-col justify-between gap-3 border p-4 rounded-md bg-gray-50 hover:bg-gray-100 transition duration-200"
                  >
                    <div>
                      <p className="font-medium text-gray-800">
                        {template.name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {template.path}
                      </p>
                    </div>
                    <div className="mt-auto">
                      <CustomButton
                        type="button"
                        text="Use"
                        disabled={actionsLoading}
                        click={() => handleUseTemplate(template)}
                        title="Use Template"
                        className="w-full sm:w-auto"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Upload File Section */}
          <section className="bg-white p-6">
            <h3 className="text-xl font-semibold text-gray-700 mb-4">
              Upload Document
              <span className="text-sm font-normal text-gray-500 ml-2">
                (Email files like .eml, .msg will be automatically extracted)
              </span>
            </h3>

            <label className="block text-sm font-medium text-gray-700">
              Choose File
            </label>
            <div className="flex flex-col items-center gap-3 p-4 border border-dashed border-gray-400 rounded-lg bg-gray-100 hover:bg-gray-200 transition cursor-pointer">
              <label className="flex flex-col items-center gap-2 text-gray-700 font-medium cursor-pointer">
                <span className="text-2xl">📂</span>
                <span className="text-sm">Click to choose a file</span>
                <input
                  type="file"
                  ref={inputRef}
                  className="hidden"
                  onChange={handleFileChange}
                  accept=".eml,.msg,.email,.pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.zip,.rar"
                />
              </label>

              {selectedFile && (
                <div className="mt-2 w-full text-center">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-gray-800 font-medium text-sm truncate block max-w-xs">
                      {selectedFile.name}
                    </span>
                    {['eml', 'msg', 'email'].includes(
                      selectedFile.name.split('.').pop().toLowerCase(),
                    ) && (
                      <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                        Email File
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="text-red-500 text-xs mt-1 hover:underline"
                    onClick={() => setSelectedFile(null)}
                  >
                    Remove File
                  </button>
                </div>
              )}
            </div>

            {/* Tag Input */}
            <div className="mt-4">
              <label className="text-sm font-medium text-gray-700">Tags</label>
              <div className="relative" ref={dropdownRef}>
                <div className="flex items-center flex-wrap gap-2 border rounded-lg p-2">
                  {fileDetails.tags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTag(tag);
                        }}
                        className="hover:bg-indigo-200 rounded-full p-0.5"
                      >
                        <IconX size={14} />
                      </button>
                    </span>
                  ))}

                  <div className="flex-1 flex items-center">
                    <input
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setOpen(true);
                      }}
                      onFocus={() => setOpen(true)}
                      placeholder="Type to search tags..."
                      className="flex-1 min-w-[120px] outline-none text-sm bg-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => setOpen(!open)}
                      className="ml-2 text-gray-500 hover:text-gray-700"
                    >
                      {open ? (
                        <IconChevronUp size={18} />
                      ) : (
                        <IconChevronDown size={18} />
                      )}
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="absolute z-20 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-auto">
                    {filteredTags.length > 0 ? (
                      filteredTags.map((tag) => (
                        <div
                          key={tag}
                          onClick={() => addTag(tag)}
                          className="px-4 py-2 cursor-pointer hover:bg-indigo-50 text-sm border-b last:border-b-0"
                        >
                          {tag}
                        </div>
                      ))
                    ) : search ? (
                      <div className="px-4 py-3 text-sm text-gray-500 text-center">
                        No tags found matching "{search}"
                      </div>
                    ) : (
                      <div className="px-4 py-3 text-sm text-gray-500 text-center">
                        Type to search tags
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Part Number & Description */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Document Description
                </label>
                <input
                  type="text"
                  value={fileDetails.fileDescription}
                  onChange={(e) =>
                    setFileDetails((prev) => ({
                      ...prev,
                      fileDescription: e.target.value,
                    }))
                  }
                  className="border border-gray-300 p-2 rounded-md w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter file-specific description"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Version Number (optional)
                </label>
                <input
                  type="text"
                  value={fileDetails.issueNo}
                  onChange={(e) =>
                    setFileDetails((prev) => ({
                      ...prev,
                      issueNo: e.target.value,
                    }))
                  }
                  className="border border-gray-300 p-2 rounded-md w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter Version Number"
                />
              </div>
              {fileDetails.preApproved && (
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Document Name
                  </label>
                  <input
                    type="text"
                    value={fileDetails.name}
                    onChange={(e) =>
                      setFileDetails((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    className="border border-gray-300 p-2 rounded-md w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter Name"
                  />
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2">
              <input
                type="checkbox"
                id="preApproved"
                checked={fileDetails.preApproved}
                onChange={(e) =>
                  setFileDetails((prev) => ({
                    ...prev,
                    preApproved: e.target.checked,
                  }))
                }
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label
                htmlFor="preApproved"
                className="text-sm font-medium text-gray-700"
              >
                Pre-Approved
              </label>
            </div>

            <CustomButton
              type="button"
              click={handleUpload}
              text={
                isExtractingEmail ? 'Extracting Email...' : 'Upload Document'
              }
              disabled={!selectedFile || actionsLoading || isExtractingEmail}
              className="w-full mt-6"
            />
          </section>

          {/* Email Threads Section */}
          {emailThreads?.length > 0 && (
            <section className="mt-8">
              <div className="flex items-center mb-6">
                <div className="flex-grow border-t border-blue-300"></div>
                <span className="mx-4 text-sm font-semibold text-blue-700 uppercase tracking-wide flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-full">
                  <IconMail size={16} className="text-blue-600" />
                  Email Conversations ({emailThreads.length})
                </span>
                <div className="flex-grow border-t border-blue-300"></div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {emailThreads.map((thread) => {
                  const threadId = thread.id;
                  return (
                    <div
                      key={threadId}
                      className="group relative bg-gradient-to-br from-white to-blue-50 border border-blue-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-lg transition-all duration-300"
                    >
                      <div className="flex justify-end mb-4">
                        <IconTrash
                          color="red"
                          className="cursor-pointer hover:opacity-80"
                          onClick={() => setRemoveEmailThredModel(threadId)}
                        />
                      </div>

                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
                            <IconMail className="text-white" size={24} />
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="mb-3">
                            <h3 className="font-semibold text-gray-900 text-lg mb-2 truncate">
                              {thread.emails?.[0]?.subject ||
                                'Email Conversation'}
                            </h3>

                            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-3">
                              <div className="flex items-center gap-1">
                                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                <span className="font-medium">
                                  Extracted from EML
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <IconPaperclip size={14} />
                                <span className="font-medium">
                                  {thread.attachmentsMapping?.length || 0}{' '}
                                  attachments
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <IconClock size={14} />
                                <span>{formatDate(thread.extractedAt)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-end">
                            <CustomButton
                              variant="outline"
                              size="sm"
                              text="View Thread"
                              click={() => handleViewEmailThread(thread)}
                              className="px-4"
                              disabled={actionsLoading}
                              icon={<IconEye size={16} />}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Uploaded Document List */}
          <section className="bg-white p-4 sm:p-6">
            <h3 className="text-xl font-semibold text-gray-700 mb-4">
              Uploaded Documents ({documentFields.length})
            </h3>

            {documentFields.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 mt-2 bg-purple-100 p-3 rounded-md">
                <IconInfoCircle color="blue" /> No documents uploaded yet.
              </div>
            ) : (
              <ul className="mt-4 space-y-4">
                {documentFields.map((doc, index) => (
                  <li
                    key={doc.documentId || index}
                    className={`p-4 bg-white border rounded-lg shadow-sm space-y-3 ${
                      doc.fromEmail
                        ? 'border-l-4 border-l-blue-500 bg-blue-50'
                        : ''
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div
                        className={`min-w-10 min-h-10 w-10 h-10 flex items-center justify-center rounded-full text-white ${
                          doc.fromEmail ? 'bg-blue-400' : 'bg-purple-400'
                        }`}
                      >
                        {doc.fromEmail ? <IconMail size={20} /> : '📄'}
                      </div>
                      <div className="text-sm min-w-0 flex-1">
                        <div className="flex justify-between">
                          <p className="text-base font-medium text-gray-900 break-words">
                            {doc.name || 'Unnamed Document'}
                            {doc.fromEmail && (
                              <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                                From Email
                              </span>
                            )}
                          </p>
                          {doc.fromEmail && doc.emailSubject && (
                            <span className="text-xs text-gray-500">
                              From: {doc.emailFrom}
                            </span>
                          )}
                        </div>
                        <p className="text-gray-700">
                          Document ID: {doc.documentId}
                        </p>
                        <p className="text-gray-700">
                          Tags: {doc.tags?.join(', ') || 'None'}
                        </p>
                        {doc.emailSubject && (
                          <p className="text-sm text-blue-700">
                            Subject: {doc.emailSubject}
                          </p>
                        )}
                        {doc.description && (
                          <p className="text-sm text-gray-600">
                            {doc.description}
                          </p>
                        )}
                        {doc.info && (
                          <p className="text-sm text-blue-700 bg-blue-50 px-2 py-1 rounded-md mt-1 w-fit">
                            ℹ️ {doc.info}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      <CustomButton
                        type="button"
                        disabled={actionsLoading}
                        click={() =>
                          handleViewFile(
                            doc.name,
                            doc.documentPath || '/check',
                            doc.documentId,
                            doc.name?.split('.').pop(),
                            true,
                          )
                        }
                        text="View"
                        className="w-auto"
                      />

                      <CustomButton
                        type="button"
                        disabled={actionsLoading}
                        click={() =>
                          handleDeleteDocument(index, doc.documentId)
                        }
                        variant="danger"
                        text="Delete"
                        className="w-auto"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <CustomButton
            type="button"
            click={handleSubmit(onSubmit)}
            disabled={
              actionsLoading || isExtractingEmail || documentFields.length === 0
            }
            text="Initiate Process"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3"
          />
        </form>
      </CustomCard>

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
        />
      )}
    </>
  );
}
