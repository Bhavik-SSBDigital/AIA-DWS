import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import {
  getTemplatesByTag,
  createTemplateDocument,
  uploadTemplateFile,
  ViewDocument,
} from '../../common/Apis';
import CustomButton from '../../CustomComponents/CustomButton';
import { IconEye, IconPlus, IconUpload, IconTemplate } from '@tabler/icons-react';
import { toast } from 'react-toastify';
import ViewFile from '../view/View';
import TopLoader from '../../common/Loader/TopLoader';
import { ImageConfig } from '../../config/ImageConfig';

// Make sure you import your folder icon if you use one
// import folderIcon from '../../assets/folder-icon.png'; 

const supportedExtensions = [
  'docx',
  'xlsx',
  'pptx',
  'docm',
  'xlsm',
  'pptm',
  'dotx',
  'xltx',
  'potx',
];

const TagTemplates = () => {
  // Capture tagId from URL (e.g., /tags/:id/templates)
  const { id: tagId } = useParams(); 
  
  const [file, setFile] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [fileView, setFileView] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      templateName: '',
      extension: supportedExtensions[0],
    },
  });

  useEffect(() => {
    if (tagId) {
      fetchTemplates(tagId);
    }
  }, [tagId]);

  const fetchTemplates = async (tId) => {
    try {
      const res = await getTemplatesByTag(tId);
      setTemplates(res.data.templates);
    } catch (error) {
      console.error('Failed to fetch templates', error);
    }
  };

  const onCreateTemplate = async (data) => {
    if (!tagId) return;
    setActionsLoading(true);
    try {
      // Pass tagId as a number
      const payload = { ...data, tagId: parseInt(tagId) };
      const res = await createTemplateDocument(payload);
      toast.success(res?.data?.message);
      reset();
      fetchTemplates(tagId);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
    }
  };

  const handleFileUpload = async () => {
    if (!file || !tagId) return;

    setActionsLoading(true);
    try {
      const formData = new FormData();
      formData.append('tagId', tagId);
      formData.append('purpose', 'template');
      formData.append('file', file);

      const res = await uploadTemplateFile(formData);
      toast.success(res?.data?.message);
      setFile(null);
      fetchTemplates(tagId);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
    }
  };

  const handleViewFile = async (name, path, fileId, type) => {
    setActionsLoading(true);
    try {
      const fileData = await ViewDocument(name, path, type, fileId);
      setFileView(fileData);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
    }
  };

  return (
    <>
      {actionsLoading && <TopLoader />}

      <div className="max-w-6xl mx-auto py-8 px-4">
        <div className="bg-white rounded-xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="px-8 py-6 bg-indigo-600 text-white flex items-center gap-4">
            <div className="p-3 bg-indigo-500 rounded-lg shadow-sm">
                <IconTemplate size={32} />
            </div>
            <div>
                <h1 className="text-3xl font-bold">Tag Template Manager</h1>
                <p className="text-indigo-100 mt-1">
                Create and manage templates tied to this process tag.
                </p>
            </div>
          </div>

          <div className="p-8">
            {!tagId ? (
              <div className="bg-red-50 border-l-4 border-red-500 p-4">
                <div className="flex items-center">
                  <div>
                    <span className="text-red-900 font-semibold">Error</span>
                    <p className="text-red-700">No Tag ID found in URL.</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Section 1: Create Template Entry */}
                <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                    <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                      <IconPlus className="mr-2 text-indigo-600" size={20} />
                      Create Blank Template
                    </h3>
                  </div>
                  <div className="p-6">
                    <form
                      onSubmit={handleSubmit(onCreateTemplate)}
                      className="grid grid-cols-1 md:grid-cols-2 gap-6"
                    >
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Template Name
                        </label>
                        <input
                          {...register('templateName', {
                            required: 'Template name is required',
                          })}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200"
                          placeholder="Enter template name"
                        />
                        {errors.templateName && (
                          <p className="mt-1 text-sm text-red-600">
                            {errors.templateName.message}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          File Extension
                        </label>
                        <select
                          {...register('extension')}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200"
                        >
                          {supportedExtensions.map((ext) => (
                            <option key={ext} value={ext}>
                              {ext.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-1 md:col-span-2">
                        <CustomButton
                          disabled={actionsLoading}
                          text={'Create Template'}
                          click={handleSubmit(onCreateTemplate)}
                          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700"
                        />
                      </div>
                    </form>
                  </div>
                </section>

                {/* Section 2: Upload File */}
                <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                    <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                      <IconUpload className="mr-2 text-green-600" size={20} />
                      Upload Existing Template File
                    </h3>
                  </div>
                  <div className="p-6">
                    <div className="flex flex-col md:flex-row gap-6">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Select File
                        </label>
                        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:bg-gray-50 transition-colors">
                          <div className="space-y-1 text-center">
                            <svg
                              className="mx-auto h-12 w-12 text-gray-400"
                              stroke="currentColor"
                              fill="none"
                              viewBox="0 0 48 48"
                              aria-hidden="true"
                            >
                              <path
                                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            <div className="flex text-sm text-gray-600 justify-center">
                              <label
                                htmlFor="file-upload"
                                className="relative cursor-pointer bg-transparent rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500"
                              >
                                <span>Upload a file</span>
                                <input
                                  id="file-upload"
                                  name="file-upload"
                                  type="file"
                                  className="sr-only"
                                  onChange={(e) =>
                                    setFile(e.target.files?.[0] || null)
                                  }
                                />
                              </label>
                              <p className="pl-1">or drag and drop</p>
                            </div>
                            <p className="text-xs text-gray-500">
                              {file?.name || 'No file selected'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-6">
                      <CustomButton
                        disabled={actionsLoading || !file}
                        text={'Upload File'}
                        click={handleFileUpload}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-700"
                      />
                    </div>
                  </div>
                </section>

                {/* Section 3: Template List */}
                <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-gray-800">
                      Tag Templates ({templates.length})
                    </h3>
                  </div>
                  <div className="p-6">
                    {templates.length === 0 ? (
                      <div className="text-center py-10">
                        <IconTemplate className="mx-auto h-12 w-12 text-gray-300" />
                        <h3 className="mt-2 text-sm font-medium text-gray-900">
                          No templates found
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                          Get started by creating a new template or uploading a
                          file.
                        </p>
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                        <ul className="divide-y divide-gray-200">
                          {templates.map((tpl, idx) => {
                            return (
                              <li
                                key={idx}
                                className="hover:bg-white transition duration-150 ease-in-out"
                              >
                                <div className="px-4 py-5 sm:px-6 flex items-center justify-between">
                                  <div className="flex items-center space-x-4">
                                    {/* File Icon */}
                                    <img
                                      src={
                                        tpl.type !== 'folder'
                                          ? ImageConfig[
                                              tpl.name
                                                ?.split('.')
                                                .pop()
                                                ?.toLowerCase()
                                            ] || ImageConfig['default']
                                          : '/folder-icon.png' // <-- Adjust this fallback if necessary
                                      }
                                      className="h-10 w-10 p-1 rounded border bg-white shadow-sm"
                                      alt={tpl.name}
                                    />

                                    {/* File Info */}
                                    <div className="min-w-0">
                                      <div className="text-md font-medium text-gray-900 truncate">
                                        {tpl.name}
                                      </div>
                                      <div className="mt-1 flex">
                                        <div className="flex items-center text-sm text-gray-500">
                                          <span className="truncate">
                                            {tpl.path}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Right-side actions */}
                                  <div className="flex items-center space-x-4">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                                      {tpl.name
                                        ?.split('.')
                                        .pop()
                                        ?.toUpperCase()}
                                    </span>
                                    <CustomButton
                                      text={<IconEye size={18} />}
                                      title="View File"
                                      click={() =>
                                        handleViewFile(
                                          tpl.name,
                                          tpl.path,
                                          tpl.id,
                                          tpl.name
                                            ?.split('.')
                                            .pop()
                                            ?.toLowerCase(),
                                        )
                                      }
                                    />
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>

        {/* Section 4: File Viewer Modal */}
        {fileView && (
          <ViewFile
            docu={fileView}
            setFileView={setFileView}
            handleViewClose={() => setFileView(null)}
          />
        )}
      </div>
    </>
  );
};

export default TagTemplates;