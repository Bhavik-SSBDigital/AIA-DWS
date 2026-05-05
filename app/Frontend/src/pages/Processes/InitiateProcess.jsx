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
  getTagEmails // Added API import
} from '../../common/Apis';
import { 
  IconBold, 
  IconItalic, 
  IconUnderline, 
  IconList, 
  IconClearFormatting,
  IconCheck,
  IconListNumbers 
} from '@tabler/icons-react';
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
  IconPrinter,
  IconSettings,
  IconCreditCard,
  IconCalendarEvent
} from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import CustomButton from '../../CustomComponents/CustomButton';
import TopLoader from '../../common/Loader/TopLoader';
import ViewFile from '../view/View';
import CustomCard from '../../CustomComponents/CustomCard';
import Title from '../../CustomComponents/Title';
import EmailThreadModal from './EmailThreadModal';
import CustomModal from '../../CustomComponents/CustomModal';

// Enhanced Rich Text Editor supporting Tables, Lists, Formatting, and Compact Mode
const RichTextEditor = ({ value, onChange, placeholder, disabled, compact = false }) => {
  const editorRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);
  const [activeFormats, setActiveFormats] = useState({});

  useEffect(() => {
    if (editorRef.current && value !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = value || "";
    }
  }, [value]);

  const handleInput = () => {
    if (onChange && editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
    detectActiveFormats();
  };

  const detectActiveFormats = () => {
    setActiveFormats({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
    });
  };

  const formatText = (command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current.focus();
    handleInput();
  };

  const normalizeNumber = (val) => {
    if (!val) return val;
    const sciRegex = /^-?\d+(\.\d+)?e[+-]?\d+$/i;
    if (sciRegex.test(val.trim())) {
      const num = Number(val);
      if (!isNaN(num)) {
        return num.toLocaleString("fullwide", { useGrouping: false });
      }
    }
    return val;
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const clipboardData = e.clipboardData || window.clipboardData;
    const htmlData = clipboardData.getData("text/html");
    const textData = clipboardData.getData("text/plain");

    if (htmlData && htmlData.includes("<table")) {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = htmlData;
      const tables = tempDiv.querySelectorAll("table");
      let cleanHtml = "";

      tables.forEach((table) => {
        table.removeAttribute("style");
        table.removeAttribute("class");
        const cells = table.querySelectorAll("td, th");
        cells.forEach((cell) => {
          let text = cell.innerText.trim();
          text = normalizeNumber(text);
          cell.innerText = text;
          while (cell.attributes.length > 0) {
            cell.removeAttribute(cell.attributes[0].name);
          }
        });
        cleanHtml += table.outerHTML + "<p><br></p>";
      });
      document.execCommand("insertHTML", false, cleanHtml);
      handleInput();
      return;
    }

    if (textData && textData.includes("\t")) {
      const rows = textData.split(/\r?\n/).filter(Boolean);
      let tableHtml = "<table><tbody>";
      rows.forEach((row) => {
        tableHtml += "<tr>";
        row.split("\t").forEach((cell) => {
          let cleanCell = cell.replace(/^"(.*)"$/, "$1").replace(/""/g, '"');
          cleanCell = normalizeNumber(cleanCell);
          tableHtml += `<td>${cleanCell}</td>`;
        });
        tableHtml += "</tr>";
      });
      tableHtml += "</tbody></table><p><br></p>";
      document.execCommand("insertHTML", false, tableHtml);
      handleInput();
      return;
    }

    const safeHtml = htmlData
      ?.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      ?.replace(/style="[^"]*"/g, "");

    if (safeHtml) {
      document.execCommand("insertHTML", false, safeHtml);
    } else {
      document.execCommand("insertText", false, textData);
    }
    handleInput();
  };

  const ToolbarButton = ({ onClick, icon: Icon, active, title }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        rounded-lg transition-all duration-200 flex items-center justify-center
        ${compact ? "p-1.5" : "p-2"}
        ${active ? "bg-indigo-100 text-indigo-700 shadow-sm" : "text-slate-600"}
        hover:bg-slate-200/70 hover:text-slate-900
        disabled:opacity-40
      `}
      title={title}
    >
      <Icon size={compact ? 16 : 18} stroke={2.5} />
    </button>
  );

  return (
    <div
      className={`
      group flex flex-col w-full rounded-xl border transition-all duration-300 overflow-hidden
      bg-white
      ${
        isFocused
          ? "border-indigo-400 ring-2 ring-indigo-500/20 shadow-sm"
          : "border-slate-300 hover:border-slate-400"
      }
      ${disabled ? "bg-slate-50 opacity-80" : ""}
    `}
    >
      {!disabled && (
        <div className={`flex items-center justify-between border-b bg-slate-50/50 ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}>
          <div className="flex items-center gap-1">
            <ToolbarButton onClick={() => formatText("bold")} icon={IconBold} active={activeFormats.bold} title="Bold" />
            <ToolbarButton onClick={() => formatText("italic")} icon={IconItalic} active={activeFormats.italic} title="Italic" />
            <ToolbarButton onClick={() => formatText("underline")} icon={IconUnderline} active={activeFormats.underline} title="Underline" />
            <div className={`w-px bg-slate-300 mx-1 ${compact ? 'h-4' : 'h-5'}`} />
            <ToolbarButton onClick={() => formatText("insertUnorderedList")} icon={IconList} title="Bullet List" />
            <ToolbarButton onClick={() => formatText("insertOrderedList")} icon={IconListNumbers} title="Numbered List" />
            <div className={`w-px bg-slate-300 mx-1 ${compact ? 'h-4' : 'h-5'}`} />
            <ToolbarButton onClick={() => formatText("removeFormat")} icon={IconClearFormatting} title="Clear Formatting" />
          </div>
        </div>
      )}

      <div
        ref={editorRef}
        contentEditable={!disabled}
        onInput={handleInput}
        onPaste={handlePaste}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          handleInput();
        }}
        placeholder={placeholder}
        className={`
          w-full text-slate-800 outline-none overflow-y-auto custom-scrollbar break-words whitespace-normal
          ${compact ? "p-3 text-[13px] min-h-[100px] max-h-[250px]" : "p-5 text-[15px] min-h-[240px] max-h-[600px]"}
          leading-relaxed
          
          [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-300

          [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full [&_table]:w-full [&_table]:border-collapse [&_table]:border [&_table]:my-3
          [&_th]:bg-slate-100 [&_th]:font-semibold [&_th]:p-2 [&_th]:text-sm
          [&_td]:p-2 [&_td]:text-sm [&_td]:border

          [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:my-2
          [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:my-2
          [&_p]:mb-2 [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap

          empty:before:content-[attr(placeholder)]
          empty:before:text-slate-400 empty:before:italic
        `}
      />
    </div>
  );
};

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

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [printPref, setPrintPref] = useState('PROCESS'); 
  const [pendingSubmitData, setPendingSubmitData] = useState(null);

  // STATES: Payment Tracking
  const [paymentMode, setPaymentMode] = useState('NONE'); // 'NONE', 'ON_APPROVAL', 'ON_DATE'
  const [paymentDate, setPaymentDate] = useState('');

  // STATES: Tag Emails Tracking
  const [tagEmails, setTagEmails] = useState([]);
  const [fetchingEmails, setFetchingEmails] = useState(false);

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

  const [workflowId, processTagId, formDescription] = watch(['workflowId', 'processTagId', 'description']);

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

  // EFFECT: Fetch emails for selected tag
  useEffect(() => {
    if (processTagId) {
      const fetchEmails = async () => {
        setFetchingEmails(true);
        try {
          const res = await getTagEmails(processTagId);
          setTagEmails(res?.data?.emails || []);
        } catch (error) {
          console.error('Error fetching tag emails:', error);
          setTagEmails([]);
        } finally {
          setFetchingEmails(false);
        }
      };
      fetchEmails();
    } else {
      setTagEmails([]);
    }
  }, [processTagId]);

  const inputRef = useRef(null);

  const handleFileChange = (e) => {
    if (!e.target.files) return;

    const rawFiles = Array.from(e.target.files);
    
    // Strict Filtering Based on Requirements
    const allowedExts = ['pdf', 'xls', 'xlsx', 'eml'];
    const validFiles = rawFiles.filter(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      return allowedExts.includes(ext);
    });

    if (validFiles.length !== rawFiles.length) {
      toast.error("Some files were removed. Strictly only .pdf, .xls, .xlsx, and .eml are allowed.");
    }

    if(validFiles.length === 0) return;

    setSelectedFiles((prev) => [...prev, ...validFiles]);

    validFiles.forEach((file) => {
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
          toast.info(`Processing email file (${file.name})...`);
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

  const handleInitialSubmit = (data) => {
    if (data?.documents?.length === 0) {
      toast.info('Please upload documents for process');
      return;
    }
    
    // Validation: If Payment On Date is selected, date is mandatory
    if (paymentMode === 'ON_DATE' && !paymentDate) {
      toast.error('Please select a payment date before proceeding.');
      return;
    }

    setPendingSubmitData(data);
    setShowConfirmModal(true);
  };

  const executeFinalSubmit = async () => {
    setShowConfirmModal(false);
    const data = pendingSubmitData;
    const selectedTagObj = allTags.find((t) => t.id === parseInt(data.processTagId));

    const submitData = {
      ...data,
      tag: selectedTagObj ? selectedTagObj.name : '',
      printDescriptionPref: printPref,
      paymentMode: paymentMode, // Attached to payload
      paymentDate: paymentMode === 'ON_DATE' ? paymentDate : null, // Attached to payload
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
    <div className="min-h-screen bg-slate-50 p-6 md:p-10 font-sans text-slate-900">
      {/* Remove Email Thread Modal */}
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

      {/* Confirmation Modal for Print Description Preference */}
      <CustomModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        size="lg"
      >
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4 border-b pb-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full border border-indigo-200">
              <IconPrinter size={28} stroke={1.5} />
            </div>
            <div>
                <h2 className="text-xl font-bold text-slate-900">Confirm Process Details</h2>
                <p className="text-sm text-slate-500">Please confirm how you'd like to handle descriptions on documents.</p>
            </div>
          </div>
          
          <div className="mb-6">
            <h3 className="text-sm font-bold text-slate-700 mb-2">Process Description Preview:</h3>
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg overflow-y-auto max-h-[150px] text-sm text-slate-800 custom-scrollbar break-words whitespace-normal"
                 dangerouslySetInnerHTML={{ __html: pendingSubmitData?.description || '<i class="text-slate-400">No description</i>' }}>
            </div>
          </div>

          <div className="mb-6 space-y-3">
             <p className="text-sm font-bold text-slate-700">Would you like to print this description on the uploaded PDF documents?</p>
             <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                <input type="radio" name="printPref" value="PROCESS" checked={printPref === 'PROCESS'} onChange={(e) => setPrintPref(e.target.value)} className="w-4 h-4 text-indigo-600 focus:ring-indigo-500" />
                <span className="text-sm font-medium text-slate-800">Print <span className="font-bold">Process Description</span> on all PDF documents.</span>
             </label>
             <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                <input type="radio" name="printPref" value="INDIVIDUAL" checked={printPref === 'INDIVIDUAL'} onChange={(e) => setPrintPref(e.target.value)} className="w-4 h-4 text-indigo-600 focus:ring-indigo-500" />
                <span className="text-sm font-medium text-slate-800">Print <span className="font-bold">Individual Document Descriptions</span> on their respective PDFs.</span>
             </label>
             <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                <input type="radio" name="printPref" value="NONE" checked={printPref === 'NONE'} onChange={(e) => setPrintPref(e.target.value)} className="w-4 h-4 text-indigo-600 focus:ring-indigo-500" />
                <span className="text-sm font-medium text-slate-800">Do <span className="font-bold">NOT</span> print descriptions on documents.</span>
             </label>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
              onClick={() => setShowConfirmModal(false)}
            >
              Back to Edit
            </button>
            <button
              className="px-6 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
              onClick={executeFinalSubmit}
            >
              Confirm & Initiate
            </button>
          </div>
        </div>
      </CustomModal>

      {actionsLoading || isExtractingEmail ? <TopLoader /> : null}

      <div className="max-w-7xl mx-auto space-y-6">
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Initiate Process</h1>
          <p className="text-slate-500 mt-2 text-sm max-w-3xl">
            Configure workflow parameters and attach supporting documentation. Email
            files (.eml, .msg) are automatically processed and extracted.
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit(handleInitialSubmit)}>
          {/* Configuration Section */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className={`flex flex-col gap-6 ${templates?.length > 0 ? 'xl:col-span-8' : 'xl:col-span-12'}`}>
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex-grow flex flex-col">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-xl">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <IconSettings size={18} className="text-slate-400" /> Process Configuration
                  </h3>
                </div>
                <div className="p-6 flex flex-col gap-6 flex-grow">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Target Workflow</label>
                      <select
                        className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm px-4 py-2.5 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        value={selectedWorkflow?.name || ''}
                        onChange={(e) => {
                          const selected = workflowData.find((wf) => wf.name === e.target.value);
                          setSelectedWorkflow(selected);
                        }}
                      >
                        <option value="">Select a Workflow</option>
                        {workflowData.map((wf) => (
                          <option key={wf.name} value={wf.name}>{wf.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Process Tag</label>
                      <select
                        {...register('processTagId', { required: 'Process Tag is required' })}
                        className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm px-4 py-2.5 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      >
                        <option value="">Select a Tag</option>
                        {allTags.map((tag) => (
                          <option key={tag.id} value={tag.id}>{tag.name}</option>
                        ))}
                      </select>
                      {errors.processTagId && (
                        <p className="text-red-500 text-xs mt-1.5 font-medium">{errors.processTagId.message}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex-grow flex flex-col">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Process Description</label>
                    <Controller
                      name="description"
                      control={control}
                      rules={{ required: 'Description is required' }}
                      render={({ field: { onChange, value } }) => (
                         <RichTextEditor
                           value={value}
                           onChange={onChange}
                           placeholder="Enter process context and objectives. You can paste tables or formatted text..."
                         />
                      )}
                    />
                    {errors.description && (
                      <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1 font-medium">
                        <IconInfoCircle size={14} /> {errors.description.message}
                      </p>
                    )}
                  </div>
                  
                  {/* PAYMENT CONFIGURATION SECTION */}
                  <div className="flex-grow flex flex-col border-t border-slate-100 pt-6 mt-2">
                    <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4">
                      <IconCreditCard size={18} className="text-slate-400" /> Payment & Notifications
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <label className={`flex flex-col gap-1 p-4 border rounded-xl cursor-pointer transition-all ${paymentMode === 'NONE' ? 'bg-slate-50 border-slate-400 ring-1 ring-slate-400' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                        <div className="flex items-center gap-2">
                          <input type="radio" name="paymentMode" value="NONE" checked={paymentMode === 'NONE'} onChange={() => { setPaymentMode('NONE'); setPaymentDate(''); }} className="w-4 h-4 text-indigo-600 focus:ring-indigo-500" />
                          <span className="text-sm font-bold text-slate-800">No Payment Configured</span>
                        </div>
                        <span className="text-xs text-slate-500 ml-6">Proceed without automated email triggers.</span>
                      </label>

                      <label className={`flex flex-col gap-1 p-4 border rounded-xl cursor-pointer transition-all ${paymentMode === 'ON_APPROVAL' ? 'bg-indigo-50 border-indigo-400 ring-1 ring-indigo-400' : 'bg-white border-slate-200 hover:border-indigo-300'}`}>
                        <div className="flex items-center gap-2">
                          <input type="radio" name="paymentMode" value="ON_APPROVAL" checked={paymentMode === 'ON_APPROVAL'} onChange={() => { setPaymentMode('ON_APPROVAL'); setPaymentDate(''); }} className="w-4 h-4 text-indigo-600 focus:ring-indigo-500" />
                          <span className="text-sm font-bold text-slate-800">Payment on Approval</span>
                        </div>
                        <span className="text-xs text-slate-500 ml-6">Auto-email tags upon process completion.</span>
                      </label>

                      <label className={`flex flex-col gap-1 p-4 border rounded-xl cursor-pointer transition-all ${paymentMode === 'ON_DATE' ? 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-400' : 'bg-white border-slate-200 hover:border-emerald-300'}`}>
                        <div className="flex items-center gap-2">
                          <input type="radio" name="paymentMode" value="ON_DATE" checked={paymentMode === 'ON_DATE'} onChange={() => setPaymentMode('ON_DATE')} className="w-4 h-4 text-emerald-600 focus:ring-emerald-500" />
                          <span className="text-sm font-bold text-slate-800">Payment on Date</span>
                        </div>
                        <span className="text-xs text-slate-500 ml-6">Schedule an email 1 day prior at 10 AM.</span>
                      </label>
                    </div>

                    {paymentMode === 'ON_DATE' && (
                      <div className="mt-4 flex items-center gap-4 bg-emerald-50/50 p-4 border border-emerald-100 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300">
                        <IconCalendarEvent size={24} className="text-emerald-500 shrink-0" />
                        <div className="flex-1 max-w-sm">
                          <label className="block text-xs font-bold text-emerald-800 uppercase tracking-wide mb-1.5">Select Payment Date</label>
                          <input
                            type="date"
                            value={paymentDate}
                            onChange={(e) => setPaymentDate(e.target.value)}
                            min={new Date().toISOString().split("T")[0]}
                            className="w-full bg-white border border-emerald-200 text-slate-900 text-sm px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all shadow-sm"
                          />
                        </div>
                        {paymentDate && (
                          <div className="text-xs font-medium text-emerald-700 bg-emerald-100 px-3 py-2 rounded-lg border border-emerald-200 ml-auto hidden md:block">
                            Reminder will trigger on: <br/>
                            <span className="font-bold">
                              {new Date(new Date(paymentDate).getTime() - 86400000).toLocaleDateString('en-GB')} at 10:00 AM IST
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Notification Recipients Display block */}
                    {(paymentMode === 'ON_APPROVAL' || paymentMode === 'ON_DATE') && (
                      <div className="mt-4 flex flex-col sm:flex-row items-start gap-4 bg-indigo-50/40 p-4 border border-indigo-100 rounded-xl animate-in fade-in slide-in-from-top-2 duration-300">
                        <IconMail size={24} className="text-indigo-500 shrink-0 mt-0.5" />
                        <div className="flex-1 w-full">
                          <label className="block text-xs font-bold text-indigo-800 uppercase tracking-wide mb-2">Notification Recipients</label>
                          
                          {fetchingEmails ? (
                            <p className="text-sm text-indigo-600">Loading recipients...</p>
                          ) : tagEmails.length > 0 ? (
                            <div className="flex flex-wrap gap-2 mb-2">
                              {tagEmails.map((t) => (
                                <span key={t.id} className="text-xs font-bold text-indigo-700 bg-white px-3 py-1 rounded-md border border-indigo-200 shadow-sm">
                                  {t.email}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-indigo-600 mb-2 italic">
                              {!processTagId 
                                ? 'Please select a Process Tag above to load recipients.'
                                : 'No emails found for the selected tag.'}
                            </p>
                          )}
                          
                          <p className="text-xs text-indigo-700 font-medium mt-3">
                            <span className="font-bold">Note: </span>
                            {paymentMode === 'ON_APPROVAL' 
                              ? 'These recipients will be notified upon process completion.' 
                              : 'These recipients will be notified one day before the payment date at 10:00 AM.'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            </div>

            {/* Templates Section */}
            {templates?.length > 0 && (
              <div className="xl:col-span-4 flex flex-col h-full">
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col flex-grow overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <IconTemplate size={18} className="text-slate-400" /> Templates
                    </h3>
                    <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                      {templates.length}
                    </span>
                  </div>
                  <div className="p-5 overflow-y-auto max-h-[500px] space-y-3 custom-scrollbar">
                    {templates.map((template) => (
                      <div
                        key={template.id}
                        className="flex flex-col p-4 border border-slate-200 rounded-lg hover:border-indigo-300 hover:shadow-sm transition-all bg-white"
                      >
                        <div className="flex items-start gap-3 mb-3">
                          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-md flex-shrink-0">
                            <IconFileText size={20} stroke={1.5} />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-semibold text-slate-900 text-sm truncate">{template.name}</h4>
                            <p className="text-xs text-slate-500 truncate mt-0.5">{template.path}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={actionsLoading}
                          onClick={() => handleUseTemplate(template)}
                          className="w-full px-3 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors border border-indigo-100"
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
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <IconUpload size={18} className="text-slate-400" /> Document Upload
              </h3>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1.5">
                <IconCircleCheck size={14} stroke={2} /> Auto-Extract Emails
              </span>
            </div>

            <div className="p-6">
              <label className="flex flex-col items-center justify-center w-full py-10 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50/50 hover:bg-slate-50 hover:border-indigo-400 transition-all cursor-pointer group">
                <div className="p-3 bg-white shadow-sm border border-slate-200 text-slate-400 rounded-full mb-3 group-hover:text-indigo-600 group-hover:scale-105 transition-all">
                  <IconUpload size={24} stroke={1.5} />
                </div>
                <h4 className="text-sm font-bold text-slate-800 mb-1">Click or drag files here to stage</h4>
                
                <p className="text-xs text-slate-500 text-center font-medium">PDF, XLSX, XLS, EML</p>
                <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2 flex items-center gap-2 shadow-sm">
                  <IconAlertCircle size={16} className="text-red-500" />
                  <p className="text-xs text-red-600 font-bold tracking-wide uppercase">
                    NOTE: Only .xlsx, .xls, .pdf, and .eml files are allowed.
                  </p>
                </div>

                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                  accept=".pdf,.xls,.xlsx,.eml"
                />
              </label>

              {selectedFiles.length > 0 && (
                <div className="mt-6 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50/80">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider w-[25%]">File Details</th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider w-[45%]">Document Description</th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider w-[15%]">Version / Issue</th>
                          <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">Pre-Approve</th>
                          <th className="px-4 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider w-[10%]">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {selectedFiles.map((file, idx) => {
                          const key = Array.from(fileMetas.keys())[idx];
                          const meta = fileMetas.get(key) || {};
                          const ext = file.name.split('.').pop()?.toLowerCase() || '';
                          const isEmail = ['eml', 'msg', 'email'].includes(ext);
                          const isUploading = currentUploadingIndex === idx && actionsLoading;

                          return (
                            <tr key={key} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-4 align-top">
                                <div className="flex items-start gap-3">
                                  <div className="text-slate-400 mt-0.5">
                                    <IconPaperclip size={18} stroke={1.5} />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-slate-900 break-all leading-tight mb-1" title={file.name}>
                                      {file.name}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-slate-500 font-medium">{(file.size / 1024).toFixed(1)} KB</span>
                                      {isEmail && (
                                        <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-indigo-100 text-indigo-700 border border-indigo-200">
                                          Email
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td className="px-4 py-4 align-top">
                                {/* Compact Rich Text Editor to fit nicely inside the table */}
                                <RichTextEditor
                                  compact={true}
                                  value={meta.fileDescription || ''}
                                  onChange={(val) => updateMeta(key, { fileDescription: val })}
                                  placeholder="Add an optional formatted description or paste tables here..."
                                  disabled={actionsLoading}
                                />
                              </td>

                              <td className="px-4 py-4 align-top">
                                <input
                                  type="text"
                                  value={meta.issueNo || ''}
                                  onChange={(e) => updateMeta(key, { issueNo: e.target.value })}
                                  placeholder="e.g. v1.0"
                                  className="w-full bg-slate-50 border border-slate-300 focus:bg-white focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                  disabled={actionsLoading}
                                />
                              </td>

                              <td className="px-4 py-4 align-top text-center pt-6">
                                <input
                                  type="checkbox"
                                  checked={!!meta.preApproved}
                                  onChange={(e) => updateMeta(key, { preApproved: e.target.checked })}
                                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                                  disabled={actionsLoading}
                                />
                              </td>

                              <td className="px-4 py-4 align-top text-center pt-5">
                                {isUploading ? (
                                  <span className="text-indigo-600 text-xs font-bold flex items-center justify-center gap-1">
                                    <div className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => removeFile(idx, key)}
                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                    disabled={actionsLoading}
                                    title="Remove staged file"
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

                  <div className="bg-slate-50 border-t border-slate-200 p-4 flex justify-end items-center gap-4">
                    <span className="text-sm font-medium text-slate-500">
                      {selectedFiles.length} file(s) staged for upload
                    </span>
                    <button
                      type="button"
                      onClick={handleUploadAll}
                      disabled={actionsLoading || !workflowId}
                      className={`px-5 py-2.5 text-sm font-bold rounded-lg text-white shadow-sm transition-all flex items-center gap-2 ${
                        actionsLoading || !workflowId
                          ? 'bg-slate-400 cursor-not-allowed'
                          : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow'
                      }`}
                    >
                      <IconUpload size={16} />
                      {actionsLoading
                        ? `Uploading ${currentUploadingIndex + 1}/${selectedFiles.length}...`
                        : `Commit Files to Process`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Email Threads Section */}
          {emailThreads?.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <IconMessages size={18} className="text-slate-400" /> Parsed Email Threads
                </h3>
                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                  {emailThreads.length} Thread(s)
                </span>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {emailThreads.map((thread) => (
                    <div
                      key={thread.id}
                      className="group flex flex-col bg-white border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-md transition-all overflow-hidden"
                    >
                      <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/30">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className="mt-0.5 text-indigo-500 flex-shrink-0 bg-indigo-50 p-1.5 rounded-lg">
                            <IconMessages size={20} stroke={1.5} />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-semibold text-slate-900 text-sm truncate mb-0.5" title={thread.emails?.[0]?.subject}>
                              {thread.emails?.[0]?.subject || 'Email Conversation'}
                            </h4>
                            <p className="text-xs text-slate-500 truncate">
                              From: <span className="font-medium">{thread.emails?.[0]?.from || 'Unknown'}</span>
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="text-slate-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                          onClick={() => setRemoveEmailThredModel(thread.id)}
                        >
                          <IconTrash size={16} stroke={1.5} />
                        </button>
                      </div>
                      <div className="p-4 flex-grow flex flex-col gap-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500 font-medium">Extracted Attachments</span>
                          <span className="font-bold text-slate-700 flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded">
                            <IconPaperclip size={12} className="text-slate-500" />
                            {thread.attachmentsMapping?.length || 0}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500 font-medium">Processing Date</span>
                          <span className="text-slate-700 font-medium">{formatDate(thread.extractedAt)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleViewEmailThread(thread)}
                        className="w-full py-3 text-xs font-bold text-indigo-600 bg-indigo-50/50 border-t border-indigo-50 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2"
                        disabled={actionsLoading}
                      >
                        <IconEye size={16} stroke={2} /> View Full Thread
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Committed Documents Section */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <IconFileText size={18} className="text-slate-400" /> Committed Documents
              </h3>
              <span className="text-xs font-bold text-slate-700 bg-slate-200 px-3 py-1 rounded-full border border-slate-300">
                {documentFields.length} File(s)
              </span>
            </div>

            <div className="p-6 bg-slate-50/30">
              {documentFields.length === 0 ? (
                <div className="text-center py-12 bg-white border-2 border-dashed border-slate-200 rounded-xl">
                  <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
                    <IconAlertCircle size={32} stroke={1.5} />
                  </div>
                  <h4 className="text-base font-bold text-slate-800 mb-1">No documents committed</h4>
                  <p className="text-sm text-slate-500 font-medium max-w-sm mx-auto">
                    Upload and commit files from the section above to include them in this workflow process.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {documentFields.map((doc, index) => (
                    <div
                      key={doc.documentId || index}
                      className={`flex flex-col bg-white border rounded-xl shadow-sm relative overflow-hidden hover:shadow-md transition-shadow ${
                        doc.fromEmail ? 'border-indigo-200' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {/* Accent Left Border */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${doc.fromEmail ? 'bg-indigo-500' : 'bg-slate-300'}`}></div>

                      <div className="flex flex-col md:flex-row md:items-start gap-4 p-5 pl-6">
                        
                        {/* Header Info Left */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <div className={`p-2 rounded-lg ${doc.fromEmail ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-600'}`}>
                              {doc.fromEmail ? <IconMail size={20} stroke={1.5} /> : <IconFileText size={20} stroke={1.5} />}
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-base font-bold text-slate-900 truncate" title={doc.name}>
                                {doc.name || 'Unnamed Document'}
                              </h4>
                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                <span className="text-xs font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                                  ID: {doc.documentId}
                                </span>
                                {doc.issueNo && (
                                  <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                    Ver: {doc.issueNo}
                                  </span>
                                )}
                                {doc.preApproved && (
                                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                    Pre-Approved
                                  </span>
                                )}
                                {doc.fromEmail && (
                                  <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                    From Email
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {doc.info && (
                            <p className="mt-3 text-sm text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-200 flex items-start gap-2">
                              <IconInfoCircle size={18} className="flex-shrink-0 mt-0.5" />
                              {doc.info}
                            </p>
                          )}
                        </div>

                        {/* Actions Right */}
                        <div className="flex items-center gap-2 md:mt-1 self-start md:self-auto">
                          <button
                            type="button"
                            disabled={actionsLoading}
                            onClick={() => handleViewFile(doc.name, doc.documentPath || '/check', doc.documentId, doc.name?.split('.').pop(), true)}
                            className="px-4 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-2"
                          >
                            <IconEye size={16} /> View
                          </button>
                          <button
                            type="button"
                            disabled={actionsLoading}
                            onClick={() => handleDeleteDocument(index, doc.documentId)}
                            className="px-3 py-2 text-sm font-bold text-red-600 bg-white border border-red-200 hover:bg-red-50 hover:border-red-300 rounded-lg transition-colors flex items-center"
                            title="Remove Document"
                          >
                            <IconTrash size={18} />
                          </button>
                        </div>
                      </div>

                      {/* Rich Text Description Area */}
                      {doc.description && (
                        <div className="px-5 pb-5 pl-6">
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 ml-1">Document Description</div>
                          <div 
                            className="text-sm text-slate-700 bg-slate-50/80 p-4 rounded-xl border border-slate-200 overflow-y-auto max-h-[300px] shadow-inner break-words whitespace-normal
                            
                            [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full
                            
                            [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full [&_table]:w-full [&_table]:border-collapse [&_table]:border-2 [&_table]:border-slate-300 [&_table]:my-3 [&_table]:bg-white
                            [&_th]:bg-slate-100 [&_th]:font-bold [&_th]:p-3 [&_th]:border-slate-300 [&_th]:text-left
                            [&_td]:p-3 [&_td]:border [&_td]:border-slate-200
                            
                            [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:my-2
                            [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:my-2
                            [&_p]:mb-2 last:[&_p]:mb-0 [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-words
                            "
                            dangerouslySetInnerHTML={{ __html: doc.description }}
                          >
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-4 pb-10">
            <button
              type="submit"
              disabled={actionsLoading || isExtractingEmail || documentFields.length === 0}
              className={`px-8 py-3.5 rounded-xl font-bold text-base text-white shadow-lg transition-all flex items-center gap-2 ${
                actionsLoading || isExtractingEmail || documentFields.length === 0
                  ? 'bg-slate-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/30'
              }`}
            >
              {actionsLoading ? (
                <>Processing Request...</>
              ) : (
                <>
                  <IconCircleCheck size={20} />
                  Initiate Process
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {fileView && (
        <ViewFile docu={fileView} setFileView={setFileView} handleViewClose={() => setFileView(null)} />
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