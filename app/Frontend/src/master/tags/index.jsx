import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import {
  IconTags, IconPlus, IconX, IconLoader2, IconPencil, IconTrash,
  IconTemplate, IconUpload, IconFileText, IconEye, IconFileSpreadsheet,
  IconPresentation, IconArrowRight, IconDownload, IconMail, IconAt,
  IconCheck, IconAlertCircle
} from '@tabler/icons-react';
import { toast } from 'react-toastify';
import {
  GetTags, AddTags, EditTag, DeleteTag,
  getTemplatesByTag, createTemplateDocument, uploadTemplateFile,
  ViewDocument, DownloadTemplate, DeleteTemplate,
  getTagEmails, addTagEmails, deleteTagEmail,
} from '../../common/Apis';
import ViewFile from '../../pages/view/View';
import TopLoader from '../../common/Loader/TopLoader';

const supportedExtensions = [
  'docx', 'xlsx', 'pptx', 'docm', 'xlsm', 'pptm', 'dotx', 'xltx', 'potx',
];

const getFileIcon = (filename) => {
  const ext = filename?.split('.').pop()?.toLowerCase();
  if (['xlsx', 'xlsm', 'xltx'].includes(ext))
    return <IconFileSpreadsheet className="text-green-600" size={30} stroke={1.5} />;
  if (['pptx', 'pptm', 'potx'].includes(ext))
    return <IconPresentation className="text-orange-500" size={30} stroke={1.5} />;
  return <IconFileText className="text-blue-600" size={30} stroke={1.5} />;
};

// ─────────────────────────────────────────────────────────────
// Email Manager Sub-Panel
// ─────────────────────────────────────────────────────────────
const TagEmailPanel = ({ tag, isAdmin }) => {
  const [emails, setEmails] = useState([]);
  const [inputVal, setInputVal] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchEmails = useCallback(async () => {
    try {
      const res = await getTagEmails(tag.id);
      setEmails(res.data.emails || []);
    } catch { /* silent */ }
  }, [tag.id]);

  useEffect(() => { fetchEmails(); }, [fetchEmails]);

  const validateEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleAdd = async () => {
    const val = inputVal.trim().toLowerCase();
    if (!val) return;
    if (!validateEmail(val)) { toast.error('Invalid email address'); return; }
    if (emails.some((e) => e.email === val)) { toast.warning('Email already added'); setInputVal(''); return; }
    setLoading(true);
    try {
      await addTagEmails(tag.id, [val]);
      setInputVal('');
      await fetchEmails();
      toast.success('Email added');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to add email');
    } finally { setLoading(false); }
  };

  const handleDelete = async (emailId) => {
    setLoading(true);
    try {
      await deleteTagEmail(tag.id, emailId);
      await fetchEmails();
      toast.success('Email removed');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to remove email');
    } finally { setLoading(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {loading && <TopLoader />}
      {/* Header */}
      <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconMail className="text-blue-600" size={18} />
          <span className="text-sm font-bold text-gray-800">Payment Email List</span>
        </div>
        <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200">
          {emails.length} recipient{emails.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* Add input — admin only */}
        {isAdmin && (
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500 bg-gray-50">
              <IconAt size={16} className="text-gray-400 shrink-0" />
              <input
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="Add email address..."
                className="flex-1 text-sm outline-none bg-transparent text-gray-700"
                disabled={loading}
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={loading || !inputVal.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              <IconPlus size={16} /> Add
            </button>
          </div>
        )}

        {/* Email list */}
        {emails.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">
            <IconMail className="mx-auto mb-1 opacity-30" size={24} />
            No emails configured for this tag.
          </div>
        ) : (
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {emails.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <IconAt size={14} className="text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-800 truncate font-medium">{e.email}</span>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => handleDelete(e.id)}
                    disabled={loading}
                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Remove email"
                  >
                    <IconTrash size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Tag Template Manager Panel (Detail)
// ─────────────────────────────────────────────────────────────
const TagTemplateManagerPanel = ({ tag, isAdmin }) => {
  const [file, setFile] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [fileView, setFileView] = useState(null);
  const [activeTab, setActiveTab] = useState('templates');
  
  // State for the custom delete modal
  const [deletingTemplate, setDeletingTemplate] = useState(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: { templateName: '', extension: supportedExtensions[0] },
  });

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await getTemplatesByTag(tag.id);
      setTemplates(res.data.templates);
    } catch (error) {
      console.error('Failed to fetch templates', error);
    }
  }, [tag.id]);

  useEffect(() => {
    setFile(null);
    reset();
    fetchTemplates();
    setActiveTab('templates');
    setDeletingTemplate(null);
  }, [tag, fetchTemplates, reset]);

  const onCreateTemplate = async (data) => {
    setActionsLoading(true);
    try {
      const payload = { ...data, tagId: tag.id };
      const res = await createTemplateDocument(payload);
      toast.success(res?.data?.message || 'Template created');
      reset();
      fetchTemplates();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally { setActionsLoading(false); }
  };

  const handleFileUpload = async () => {
    if (!file) return;
    setActionsLoading(true);
    try {
      const formData = new FormData();
      formData.append('tagId', tag.id);
      formData.append('purpose', 'template');
      formData.append('file', file);
      const res = await uploadTemplateFile(formData);
      toast.success(res?.data?.message || 'File uploaded');
      setFile(null);
      fetchTemplates();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally { setActionsLoading(false); }
  };

  const handleViewFile = async (name, path, fileId) => {
    setActionsLoading(true);
    try {
      const type = name?.split('.').pop()?.toLowerCase();
      const fileData = await ViewDocument(name, path, type, fileId);
      setFileView(fileData);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally { setActionsLoading(false); }
  };

  const handleDownloadFile = async (name, id) => {
    setActionsLoading(true);
    try {
      await DownloadTemplate(id, name);
    } catch (error) {
      toast.error('Failed to download template.');
    } finally { setActionsLoading(false); }
  };

  const executeDeleteTemplate = async () => {
    if (!deletingTemplate) return;
    setActionsLoading(true);
    try {
      await DeleteTemplate(deletingTemplate.id);
      toast.success('Template deleted successfully');
      setDeletingTemplate(null);
      fetchTemplates();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to delete template');
    } finally {
      setActionsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col animate-fade-in relative">
      {actionsLoading && <TopLoader />}

      {/* Header */}
      <div className="px-6 py-4 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <IconTags className="text-indigo-600" size={22} />
            {tag.name}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {isAdmin ? 'Manage templates and email recipients' : 'View templates and configured emails'}
          </p>
        </div>
        <div className="bg-indigo-100 text-indigo-700 font-bold py-1 px-3 rounded-lg text-sm">
          {templates.length} Files
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 shrink-0 bg-white">
        <button
          onClick={() => setActiveTab('templates')}
          className={`flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
            activeTab === 'templates'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <IconTemplate size={16} /> Templates
        </button>
        <button
          onClick={() => setActiveTab('emails')}
          className={`flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
            activeTab === 'emails'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <IconMail size={16} /> Payment Emails
        </button>
      </div>

      {/* Content */}
      <div className="p-5 overflow-y-auto flex-grow space-y-5 bg-gray-50/30">

        {activeTab === 'emails' && (
          <TagEmailPanel tag={tag} isAdmin={isAdmin} />
        )}

        {activeTab === 'templates' && (
          <>
            {/* Create / Upload — admin only */}
            {isAdmin && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {/* Create Blank */}
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                    <IconPlus className="text-indigo-600" size={16} /> Create Blank
                  </h3>
                  <form onSubmit={handleSubmit(onCreateTemplate)} className="space-y-2.5">
                    <input
                      {...register('templateName', { required: 'Name required' })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="Template name"
                    />
                    {errors.templateName && (
                      <p className="text-red-500 text-xs">{errors.templateName.message}</p>
                    )}
                    <div className="flex gap-2">
                      <select
                        {...register('extension')}
                        className="w-1/3 px-2 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        {supportedExtensions.map((ext) => (
                          <option key={ext} value={ext}>.{ext}</option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        disabled={actionsLoading}
                        className="w-2/3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-sm py-2 transition-colors disabled:opacity-50"
                      >
                        Create
                      </button>
                    </div>
                  </form>
                </div>

                {/* Upload */}
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col">
                  <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                    <IconUpload className="text-emerald-600" size={16} /> Upload Existing
                  </h3>
                  <label className="flex-grow flex flex-col items-center justify-center border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-emerald-50 transition-all p-3 text-center">
                    <IconUpload className="w-5 h-5 mb-1 text-gray-400" />
                    <span className="text-xs text-gray-500">{file ? file.name : 'Click to select file'}</span>
                    <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  </label>
                  <button
                    onClick={handleFileUpload}
                    disabled={actionsLoading || !file}
                    className="w-full py-2 mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-50"
                  >
                    Upload
                  </button>
                </div>
              </div>
            )}

            {/* Template list */}
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                Available Templates ({templates.length})
              </h3>
              {templates.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-200">
                  <IconTemplate className="mx-auto text-gray-300 mb-2" size={28} />
                  <p className="text-sm text-gray-400">No templates attached yet.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {templates.map((tpl, idx) => (
                    <li
                      key={idx}
                      className="bg-white border border-gray-200 rounded-xl p-3 flex items-center justify-between hover:border-indigo-300 transition-colors shadow-sm"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="p-1.5 bg-gray-50 border border-gray-100 rounded-lg shrink-0">
                          {getFileIcon(tpl.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-gray-900 truncate">{tpl.name}</div>
                          <div className="text-xs text-gray-500 truncate mt-0.5">{tpl.path}</div>
                        </div>
                      </div>
                      <div className="ml-3 shrink-0 flex items-center gap-2">
                        <button
                          onClick={() => handleViewFile(tpl.name, tpl.path, tpl.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 rounded-lg transition-colors"
                        >
                          <IconEye size={14} /> View
                        </button>
                        <button
                          onClick={() => handleDownloadFile(tpl.name, tpl.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 hover:bg-emerald-100 rounded-lg transition-colors"
                        >
                          <IconDownload size={14} /> Download
                        </button>
                        
                        {isAdmin && (
                          <button
                            onClick={() => setDeletingTemplate(tpl)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 hover:bg-red-100 rounded-lg transition-colors"
                          >
                            <IconTrash size={14} /> Delete
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      {fileView && (
        <ViewFile docu={fileView} setFileView={setFileView} handleViewClose={() => setFileView(null)} />
      )}

      {/* Delete Template Custom Modal */}
      {deletingTemplate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden scale-100 transition-transform">
            <div className="p-6">
              <div className="flex flex-col items-center text-center mb-5">
                <div className="p-3 bg-red-100 text-red-600 rounded-full mb-3">
                  <IconAlertCircle size={32} stroke={1.5} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">Delete Template?</h3>
                <p className="text-sm text-gray-500">
                  This action cannot be undone. You are about to permanently delete:
                </p>
                <div className="mt-3 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 w-full">
                  <p className="text-sm font-semibold text-gray-800 break-all truncate">
                    {deletingTemplate.name}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeletingTemplate(null)}
                  disabled={actionsLoading}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={executeDeleteTemplate}
                  disabled={actionsLoading}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionsLoading ? <IconLoader2 className="animate-spin" size={16} /> : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main TagsMasterPage
// ─────────────────────────────────────────────────────────────
export default function TagsMasterPage() {
  const [tags, setTags] = useState([]);
  const [newTags, setNewTags] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTag, setActiveTag] = useState(null);
  const [editingTag, setEditingTag] = useState(null);
  const [editInput, setEditInput] = useState('');
  const [deletingTag, setDeletingTag] = useState(null);
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);

  const isAdmin =
    sessionStorage.getItem('isAdmin') === 'true' ||
    sessionStorage.getItem('specialUser') === 'true';

  const fetchTags = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await GetTags();
      setTags(data);
    } catch (err) {
      toast.error('Failed to load tags.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  const addTag = useCallback(() => {
    const tag = input.trim();
    if (!tag) return;
    if (
      newTags.some((t) => t.toLowerCase() === tag.toLowerCase()) ||
      tags.some((t) => t.name.toLowerCase() === tag.toLowerCase())
    ) {
      setInput('');
      return;
    }
    setNewTags((prev) => [...prev, tag]);
    setInput('');
    inputRef.current?.focus(); 
  }, [input, newTags, tags]);

  const removeTag = (tag) => setNewTags((prev) => prev.filter((t) => t !== tag));

  const handleSubmit = async () => {
    if (!newTags.length) return;
    try {
      setSubmitting(true);
      await AddTags({ tags: newTags });
      setNewTags([]);
      fetchTags();
      toast.success('Tags saved.');
    } catch (err) {
      toast.error('Failed to save tags.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingTag) return;
    try {
      setDeletingTag({ ...deletingTag, loading: true });
      await DeleteTag(deletingTag.id);
      setTags((prev) => prev.filter((t) => t.id !== deletingTag.id));
      if (activeTag?.id === deletingTag.id) setActiveTag(null);
      toast.success('Tag deleted.');
      setDeletingTag(null);
    } catch (err) {
      toast.error('Failed to delete tag.');
      setDeletingTag((prev) => ({ ...prev, loading: false }));
    }
  };

  const saveEdit = async () => {
    if (!editInput.trim()) return;
    try {
      const { data } = await EditTag(editingTag.id, { name: editInput.trim() });
      setTags((prev) => prev.map((t) => (t.id === editingTag.id ? data : t)));
      if (activeTag?.id === editingTag.id) setActiveTag(data);
      toast.success('Tag updated.');
      setEditingTag(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update tag.');
    }
  };

  const filteredTags = tags.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50/80 p-4 sm:p-6">
      {/* Page header */}
      <div className="mb-5 flex items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-200 max-w-[1400px] mx-auto">
        <div className="p-2.5 bg-indigo-100 rounded-xl">
          <IconTags size={26} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Tag & Template {isAdmin ? 'Management' : 'Directory'}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Select a tag to {isAdmin ? 'manage templates and email recipients' : 'view its templates'}.
          </p>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-5 h-[calc(100vh-130px)]">

        {/* ── LEFT: Tag list ── */}
        <div className="lg:w-1/3 flex flex-col gap-4 h-full">

          {/* Quick Add — admin only */}
          {isAdmin && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 shrink-0">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Quick Add Tags</h3>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-1.5 items-center min-h-[42px] px-3 border border-gray-300 rounded-xl p-1.5 focus-within:ring-2 focus-within:ring-indigo-500 bg-gray-50">
                  {newTags.map((tag, idx) => (
                    <span key={tag + idx} className="flex items-center gap-1 px-2.5 py-0.5 bg-indigo-600 text-white rounded-md text-xs font-medium">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="hover:text-red-200">
                        <IconX size={12} />
                      </button>
                    </span>
                  ))}
                  <input
                    value={input}
                    ref={inputRef}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTag()}
                    placeholder={newTags.length === 0 ? 'Type tag...' : 'Add another...'}
                    className="flex-1 min-w-[80px] outline-none text-sm text-gray-700 bg-transparent px-1"
                  />
                  <button 
                    onClick={addTag} 
                    disabled={!input.trim()}
                    className="p-1 text-indigo-600 hover:bg-indigo-100 rounded-md disabled:opacity-40 transition-colors flex-shrink-0"
                    title="Add tag"
                  >
                    <IconPlus size={18} />
                  </button>
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !newTags.length}
                  className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-50"
                >
                  Save Tags {newTags.length > 0 ? `(${newTags.length})` : ''}
                </button>
              </div>
            </div>
          )}

          {/* Tag list with search */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col flex-grow overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tags..."
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div className="overflow-y-auto p-2.5 space-y-1 flex-grow">
              {loading ? (
                <div className="py-10 text-center">
                  <IconLoader2 className="animate-spin text-indigo-500 mx-auto" size={22} />
                </div>
              ) : filteredTags.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-400">No tags found.</div>
              ) : (
                filteredTags.map((tag) => (
                  <div
                    key={tag.id}
                    onClick={() => setActiveTag(tag)}
                    className={`group flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all border ${
                      activeTag?.id === tag.id
                        ? 'bg-indigo-50 border-indigo-300 shadow-sm'
                        : 'bg-white border-gray-200 hover:border-indigo-200 hover:bg-gray-50'
                    }`}
                  >
                    {editingTag?.id === tag.id ? (
                      <input
                        autoFocus
                        value={editInput}
                        onChange={(e) => setEditInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingTag(null); }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 text-sm border border-indigo-400 rounded px-2 py-0.5 outline-none mr-2"
                      />
                    ) : (
                      <span className={`text-sm font-semibold truncate ${activeTag?.id === tag.id ? 'text-indigo-700' : 'text-gray-700'}`}>
                        {tag.name}
                      </span>
                    )}

                    <div className="flex items-center gap-1 shrink-0">
                      {editingTag?.id === tag.id ? (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); saveEdit(); }} className="p-1.5 text-green-600 hover:bg-green-50 rounded">
                            <IconCheck size={14} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); setEditingTag(null); }} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded">
                            <IconX size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          {isAdmin && (
                            <div className={`flex items-center transition-opacity ${activeTag?.id === tag.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingTag(tag); setEditInput(tag.name); }}
                                className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-md"
                              >
                                <IconPencil size={14} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeletingTag(tag); }}
                                className="p-1.5 text-gray-400 hover:text-red-600 rounded-md"
                              >
                                <IconTrash size={14} />
                              </button>
                            </div>
                          )}
                          <IconArrowRight
                            size={16}
                            className={`ml-1 transition-transform ${activeTag?.id === tag.id ? 'text-indigo-500 translate-x-0.5' : 'text-gray-300'}`}
                          />
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Detail panel ── */}
        <div className="lg:w-2/3 h-full">
          {activeTag ? (
            <TagTemplateManagerPanel tag={activeTag} isAdmin={isAdmin} />
          ) : (
            <div className="h-full bg-white rounded-2xl shadow-sm border border-dashed border-gray-200 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <IconTags className="text-gray-300" size={32} />
              </div>
              <h2 className="text-lg font-bold text-gray-700">No Tag Selected</h2>
              <p className="text-gray-400 mt-2 text-sm max-w-xs">
                Select a tag from the left panel to view and{isAdmin ? ' manage' : ''} its templates and payment email recipients.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal for TAG */}
      {deletingTag && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden scale-100 transition-transform">
            <div className="p-6">
              <div className="flex flex-col items-center text-center mb-5">
                <div className="p-3 bg-red-100 text-red-600 rounded-full mb-3">
                  <IconAlertCircle size={32} stroke={1.5} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">Delete Tag?</h3>
                <p className="text-sm text-gray-500">
                  This will also remove all associated templates and email recipients.
                </p>
                <div className="mt-3 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 w-full">
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {deletingTag.name}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeletingTag(null)}
                  disabled={deletingTag.loading}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deletingTag.loading}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deletingTag.loading ? <IconLoader2 className="animate-spin" size={16} /> : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}