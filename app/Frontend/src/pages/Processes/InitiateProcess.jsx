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
} from '../../common/Apis';
import { upload } from '../../components/drop-file-input/FileUploadDownload';
import Show from '../workflows/Show';
import apiClient from '../../common/Apis';
import { toast } from 'react-toastify';
import { IconInfoCircle, IconX, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import CustomButton from '../../CustomComponents/CustomButton';
import TopLoader from '../../common/Loader/TopLoader';
import ViewFile from '../view/View';
import CustomCard from '../../CustomComponents/CustomCard';
import Title from '../../CustomComponents/Title';

export default function InitiateProcess() {
  console.log('called');
  const navigate = useNavigate();
  const [workflowData, setWorkflowData] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileDetails, setFileDetails] = useState({
    tags: [],
    partNumber: '',
    preApproved: false,
    fileDescription: '',
    issueNo: '',
  });

  const [newTag, setNewTag] = useState('');
  const [templates, setTemplates] = useState([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [fileView, setFileView] = useState(null);

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

  useEffect(() => {
    console.log('called');
    const getWorkflowsData = async () => {
      try {
        const response = await GetWorkflows();
        setWorkflowData(response?.data?.workflows || []);
      } catch (error) {
        console.log(error);
      }
    };

    getWorkflowsData();
  }, []);

  const [allTags, setAllTags] = useState([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const fetchTags = async () => {
      try {
        const { data } = await apiClient.get('/tags');
        console.log("data", data)
        setAllTags(data.map((t) => t.name.toLowerCase()));
      } catch (e) {
        console.error(e);
      }
    };
    fetchTags();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
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
  const handleUpload = async () => {
    if (!workflowId) {
      toast.info('Please select workflow.');
      return;
    }

    if (!selectedFile) return;

    setActionsLoading(true);

    try {
      // Generate file name from backend

      const generatedName = fileDetails.preApproved
        ? {
            data: {
              documentName:
                fileDetails.name + '.' + selectedFile.name.split('.').pop(),
            },
          }
        : await GenerateDocumentName(
            workflowId,
            null,
            selectedFile.name.split('.').pop(),
          );

      // Upload file using generated name and tags
      const res = await uploadDocumentInProcess(
        [selectedFile],
        generatedName?.data?.documentName,
        fileDetails?.tags,
      );

      // Success logic
      toast.success('File uploaded successfully');

      addDocument({
        documentId: res[0],
        name: generatedName?.data?.documentName,
        tags: fileDetails.tags,
        description: fileDetails.fileDescription,
        partNumber: fileDetails.partNumber,
        preApproved: fileDetails.preApproved,
        issueNo: fileDetails.issueNo,
      });

      // Reset form
      setFileDetails({
        tags: [],
        partNumber: '',
        preApproved: false,
        fileDescription: '',
        issueNo: '',
      });

      setNewTag('');
      setSelectedFile(null);
      if (inputRef.current) inputRef.current.value = null;
    } catch (err) {
      // Show relevant error
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setActionsLoading(false);
    }
  };

  const onSubmit = async (data) => {
    if (data?.documents?.length === 0) {
      toast.info('Please upload documents for process');
      return;
    }
    setActionsLoading(true);
    try {
      const res = await ProcessInitiate(data);
      toast.success(res?.data?.message);
      console.log(data);
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
        info: 'This document is prepared from template document, please edit if you want to add the latest data in the document',
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
      {actionsLoading ? <TopLoader /> : null}
      <CustomCard className="max-w-7xl mx-auto p-6">
        <Title text={'Initiate Process'} />

        <form className="space-y-10">
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
              {/* Show Workflow Steps */}
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

          {/* Templates */}
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

          {/* Upload File */}
          <section className="bg-white p-6">
            <h3 className="text-xl font-semibold text-gray-700 mb-4">
              Upload Document
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
                />
              </label>

              {selectedFile && (
                <div className="mt-2 w-full text-center">
                  <span className="text-gray-800 font-medium text-sm truncate block">
                    {selectedFile.name}
                  </span>
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
                {/* Selected tags and input */}
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
                      {open ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
                    </button>
                  </div>
                </div>

                {/* Dropdown */}
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
              {fileDetails.preApproved ? (
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
              ) : null}
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
              text={'Upload Document'}
              disabled={!selectedFile || actionsLoading}
              className="w-full mt-6"
            />
          </section>

          {/* Uploaded Document List */}
          <section className="bg-white p-4 sm:p-6">
            <h3 className="text-xl font-semibold text-gray-700 mb-4">
              Uploaded Documents
            </h3>

            {documentFields.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 mt-2 bg-purple-100 p-3 rounded-md text-black">
                <IconInfoCircle color="blue" /> No documents uploaded yet.
              </div>
            ) : (
              <ul className="mt-4 space-y-4">
                {documentFields.map((doc, index) => (
                  <li
                    key={doc.documentId}
                    className="p-4 bg-white border rounded-lg shadow-sm space-y-3"
                  >
                    {/* Row 1: File details */}
                    <div className="flex items-start gap-4">
                      <div className="min-w-10 min-h-10 w-10 h-10 bg-purple-400 flex items-center justify-center rounded-full text-white text-lg">
                        📄
                      </div>
                      <div className="text-sm min-w-0">
                        <p className="text-base font-medium text-gray-900 break-words">
                          {doc.name || 'Unnamed Document'}
                        </p>
                        <p className="text-gray-700">ID: {doc.documentId}</p>
                        <p className="text-gray-700">
                          Tags: {doc.tags?.join(', ') || 'None'}
                        </p>
                        {doc.info && (
                          <p className="text-sm text-blue-700 bg-blue-50 px-2 py-1 rounded-md mt-1 w-fit">
                            ℹ️ {doc.info}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Row 2: Actions */}
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
                        text="✖"
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
            disabled={actionsLoading}
            text="Submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          />
        </form>
      </CustomCard>

      {/* Section 4: File Viewer Modal */}
      {fileView && (
        <ViewFile
          docu={fileView}
          setFileView={setFileView}
          handleViewClose={() => setFileView(null)}
        />
      )}
    </>
  );
}