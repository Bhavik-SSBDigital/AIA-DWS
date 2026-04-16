import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import {
  IconTags,
  IconPlus,
  IconX,
  IconLoader2,
  IconPencil,
  IconTrash,
  IconTemplate,
  IconUpload,
  IconFileText,
  IconEye,
  IconFileSpreadsheet,
  IconPresentation,
  IconArrowRight,
  IconDownload, // <-- Added Download Icon
} from '@tabler/icons-react';
import { toast } from 'react-toastify';

// Make sure your API imports point to your actual file
import {
  GetTags,
  AddTags,
  EditTag,
  DeleteTag,
  getTemplatesByTag,
  createTemplateDocument,
  uploadTemplateFile,
  ViewDocument,
  DownloadFile, // <-- Make sure to import DownloadFile
  DownloadTemplate
} from '../../common/Apis';
import ViewFile from '../../pages/view/View';
import TopLoader from '../../common/Loader/TopLoader';

const supportedExtensions = [
  'docx', 'xlsx', 'pptx', 'docm', 'xlsm', 'pptm', 'dotx', 'xltx', 'potx',
];

const getFileIcon = (filename) => {
  const ext = filename?.split('.').pop()?.toLowerCase();
  if (['xlsx', 'xlsm', 'xltx'].includes(ext)) return <IconFileSpreadsheet className="text-green-600" size={32} stroke={1.5} />;
  if (['pptx', 'pptm', 'potx'].includes(ext)) return <IconPresentation className="text-orange-500" size={32} stroke={1.5} />;
  return <IconFileText className="text-blue-600" size={32} stroke={1.5} />;
};

// =====================================================================
// SUB-COMPONENT: Tag Template Manager (Detail Panel)
// =====================================================================
const TagTemplateManagerPanel = ({ tag, isAdmin }) => { // <-- Accept isAdmin prop
  const [file, setFile] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [fileView, setFileView] = useState(null);

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
  }, [tag, fetchTemplates, reset]);

  const onCreateTemplate = async (data) => {
    setActionsLoading(true);
    try {
      const payload = { ...data, tagId: tag.id };
      const res = await createTemplateDocument(payload);
      toast.success(res?.data?.message || 'Template created successfully');
      reset();
      fetchTemplates();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
    }
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
      toast.success(res?.data?.message || 'File uploaded successfully');
      setFile(null);
      fetchTemplates();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
    }
  };

  const handleViewFile = async (name, path, fileId) => {
    setActionsLoading(true);
    try {
      const type = name?.split('.').pop()?.toLowerCase();
      const fileData = await ViewDocument(name, path, type, fileId);
      setFileView(fileData);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
    }
  };

const handleDownloadFile = async (name, id) => {
    setActionsLoading(true);
    try {
      // Use the dedicated Template Download API bypassing strict ACL
      await DownloadTemplate(id, name); 
    } catch (error) {
      console.error("Download failed", error);
      toast.error("Failed to download template.");
    } finally {
      setActionsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col animate-fade-in">
      {actionsLoading && <TopLoader />}

      {/* Header */}
      <div className="px-6 py-5 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <IconTemplate className="text-indigo-600" size={24} />
            {tag.name} Templates
          </h2>
          <p className="text-sm text-gray-500 mt-1">
             {isAdmin ? "Manage files attached to this tag" : "View and download templates for this tag"}
          </p>
        </div>
        <div className="bg-indigo-100 text-indigo-700 font-bold py-1 px-3 rounded-lg text-sm">
          {templates.length} Files
        </div>
      </div>

      <div className="p-6 overflow-y-auto flex-grow space-y-6 bg-gray-50/30">
        
        {/* Only show Upload/Create forms if the user is an admin */}
        {isAdmin && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Create Blank Template */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                <IconPlus className="text-indigo-600" size={18} /> Create Blank
              </h3>
              <form onSubmit={handleSubmit(onCreateTemplate)} className="space-y-3">
                <div>
                  <input
                    {...register('templateName', { required: 'Name required' })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Template Name"
                  />
                </div>
                <div className="flex gap-2">
                  <select
                    {...register('extension')}
                    className="w-1/3 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  >
                    {supportedExtensions.map((ext) => (
                      <option key={ext} value={ext}>.{ext}</option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={actionsLoading}
                    className="w-2/3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-50"
                  >
                    Create
                  </button>
                </div>
              </form>
            </div>

            {/* Upload Existing Template */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col">
              <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                <IconUpload className="text-emerald-600" size={18} /> Upload Existing
              </h3>
              <label className="flex-grow flex flex-col items-center justify-center border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-emerald-50 transition-all p-3 text-center">
                <IconUpload className="w-6 h-6 mb-1 text-gray-400" />
                <span className="text-xs text-gray-500 font-medium">{file ? file.name : "Click to select file"}</span>
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

        {/* Template List */}
        <div>
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-3">Available Templates</h3>
          {templates.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-xl border border-gray-200 border-dashed">
              <IconTemplate className="mx-auto text-gray-300 mb-2" size={32} />
              <p className="text-sm font-medium text-gray-500">No templates attached yet.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {templates.map((tpl, idx) => (
                <li key={idx} className="bg-white border border-gray-200 rounded-xl p-3 flex items-center justify-between hover:border-indigo-300 transition-colors shadow-sm">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="p-1.5 bg-gray-50 border border-gray-100 rounded-lg shrink-0">
                      {getFileIcon(tpl.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-gray-900 truncate">{tpl.name}</div>
                      <div className="text-xs text-gray-500 truncate mt-0.5">{tpl.path}</div>
                    </div>
                  </div>
                  
                  {/* View and Download Buttons */}
                  <div className="ml-3 shrink-0 flex items-center gap-2">
                    <button
                      onClick={() => handleViewFile(tpl.name, tpl.path, tpl.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 rounded-lg transition-colors"
                    >
                      <IconEye size={16} /> View
                    </button>
                  <button
  onClick={() => handleDownloadFile(tpl.name, tpl.id)} // <-- Pass ID instead of Path here
  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 hover:bg-emerald-100 rounded-lg transition-colors"
>
  <IconDownload size={16} /> Download
</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {fileView && <ViewFile docu={fileView} setFileView={setFileView} handleViewClose={() => setFileView(null)} />}
    </div>
  );
};


// =====================================================================
// MAIN COMPONENT: Tags Master Page (Split View)
// =====================================================================
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

  const inputRef = useRef(null);

  // Determine if user is admin
  const isAdmin = sessionStorage.getItem('isAdmin') === 'true' || sessionStorage.getItem('specialUser') === 'true';

  const fetchTags = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await GetTags();
      setTags(data);
    } catch (err) {
      console.error('Fetch tags failed:', err);
      toast.error('Failed to load tags.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const addTag = useCallback(() => {
    const tag = input.trim();
    if (!tag) return;
    if (newTags.some((t) => t.toLowerCase() === tag.toLowerCase()) || tags.some((t) => t.name.toLowerCase() === tag.toLowerCase())) {
      setInput('');
      return;
    }
    setNewTags((prev) => [...prev, tag]);
    setInput('');
  }, [input, newTags, tags]);

  const removeTag = (tag) => setNewTags((prev) => prev.filter((t) => t !== tag));

  const handleSubmit = async () => {
    if (!newTags.length) return;
    try {
      setSubmitting(true);
      await AddTags({ tags: newTags });
      setNewTags([]);
      fetchTags();
      toast.success('Tags saved successfully.');
    } catch (err) {
      console.error('Submit tags failed:', err);
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
      setTags((prev) => prev.filter((tag) => tag.id !== deletingTag.id));
      
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
      setTags((prev) => prev.map((tag) => (tag.id === editingTag.id ? data : tag)));
      
      if (activeTag?.id === editingTag.id) setActiveTag(data);
      
      toast.success('Tag updated.');
      setEditingTag(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update tag.');
    }
  };

  const startEdit = (tag) => {
    setEditingTag(tag);
    setEditInput(tag.name);
  };

  const confirmDelete = (tag) => {
    setDeletingTag(tag);
  };

  return (
    <div className="min-h-screen bg-gray-50/80 p-4 sm:p-8">

      {/* Header */}
      <div className="mb-6 flex items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-gray-200 max-w-[1400px] mx-auto">
        <div className="p-3 bg-indigo-100 rounded-xl">
          <IconTags size={28} className="text-indigo-600" stroke={2} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tag & Template {isAdmin ? "Management" : "Directory"}</h1>
          <p className="text-sm font-medium text-gray-500">Select a tag on the left to {isAdmin ? "manage" : "view"} its templates.</p>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)]">
        
        {/* LEFT COLUMN: MASTER (Tags List) */}
        <div className="lg:w-1/3 flex flex-col gap-6 h-full">
          
          {/* Quick Add - Admin Only */}
          {isAdmin && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 shrink-0">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Quick Add Tags</h3>
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2 items-center min-h-[44px] px-3 border border-gray-300 rounded-xl p-1.5 focus-within:ring-2 focus-within:ring-indigo-500 bg-gray-50">
                  {newTags.map((tag, idx) => (
                    <span key={tag + idx} className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 text-white rounded-md text-xs font-medium">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="hover:text-red-200"><IconX size={14} /></button>
                    </span>
                  ))}
                  <input
                    value={input}
                    ref={inputRef}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTag()}
                    placeholder={newTags.length === 0 ? "Type and enter..." : "Type another..."}
                    className="flex-1 min-w-[120px] outline-none text-sm text-gray-700 bg-transparent px-1"
                  />
                </div>
                <button onClick={handleSubmit} disabled={submitting || !newTags.length} className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-50 disabled:bg-gray-400">
                  Save Tags {newTags.length > 0 ? `(${newTags.length})` : ''}
                </button>
              </div>
            </div>
          )}

          {/* Tags List */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col flex-grow overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 shrink-0 flex justify-between items-center">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Directory ({tags.length})</h2>
            </div>
            
            <div className="overflow-y-auto p-3 space-y-1.5 flex-grow bg-gray-50/30">
              {loading ? (
                <div className="py-10 text-center"><IconLoader2 className="animate-spin text-indigo-500 mx-auto" size={24} /></div>
              ) : tags.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-500">No tags found.</div>
              ) : (
                tags.map((tag) => (
                  <div 
                    key={tag.id} 
                    onClick={() => setActiveTag(tag)}
                    className={`group flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all border ${
                      activeTag?.id === tag.id 
                        ? 'bg-indigo-50 border-indigo-300 shadow-sm' 
                        : 'bg-white border-gray-200 hover:border-indigo-200 hover:bg-gray-50'
                    }`}
                  >
                    <span className={`text-sm font-bold truncate ${activeTag?.id === tag.id ? 'text-indigo-700' : 'text-gray-700'}`}>
                      {tag.name}
                    </span>
                    
                    <div className="flex items-center gap-1">
                      {/* Show Edit/Delete ONLY if admin */}
                      {isAdmin && (
                        <div className={`flex items-center transition-opacity ${activeTag?.id === tag.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                          <button onClick={(e) => { e.stopPropagation(); startEdit(tag); }} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-md">
                            <IconPencil size={16} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); confirmDelete(tag); }} className="p-1.5 text-gray-400 hover:text-red-600 rounded-md">
                            <IconTrash size={16} />
                          </button>
                        </div>
                      )}
                      <IconArrowRight size={18} className={`ml-1 transition-transform ${activeTag?.id === tag.id ? 'text-indigo-500 translate-x-1' : 'text-gray-300'}`} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: DETAIL (Templates) */}
        <div className="lg:w-2/3 h-full">
          {activeTag ? (
            <TagTemplateManagerPanel tag={activeTag} isAdmin={isAdmin} />
          ) : (
            <div className="h-full bg-white rounded-2xl shadow-sm border border-gray-200 border-dashed flex flex-col items-center justify-center p-8 text-center animate-fade-in">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <IconTemplate className="text-gray-300" size={40} />
              </div>
              <h2 className="text-xl font-bold text-gray-800">No Tag Selected</h2>
              <p className="text-gray-500 mt-2 max-w-sm">
                Select a tag from the left panel to view {isAdmin && "and manage "} its associated templates.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}