import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DownloadConvertedSignedPdf } from '../../common/Apis';
import {
  ClaimProcess,
  CompleteProcess,
  deleteDocumentInProcess,
  DownloadFile,
  GetProcessData,
  getRecommendations,
  RejectDocument,
  RevokeRejection,
  SignDocument,
  SignDocumentAll,
  SignRevoke,
  ViewDocument,
} from '../../common/Apis';

import Grid2 from '@mui/material/Grid2';

import {
  IconEye,
  IconCheck,
  IconMessageCircle,
  IconX,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconAlignBoxCenterMiddle,
  IconQuestionMark,
  IconFileText,
  IconDownload,
  IconMenu2,
  IconPencil,
  IconTrash,
  IconMail,
  IconUsers,
  IconCalendar,
  IconPaperclip,
  IconChevronRight,
  IconChevronDown,
  IconUser,
  IconClock,
  IconAt,
  IconAlertSquareRoundedFilled,
  IconActivity,
  IconUpload,
  IconTag,
} from '@tabler/icons-react';
import CustomCard from '../../CustomComponents/CustomCard';
import ComponentLoader from '../../common/Loader/ComponentLoader';
import CustomButton from '../../CustomComponents/CustomButton';
import ViewFile from '../view/View';
import { toast } from 'react-toastify';
import TopLoader from '../../common/Loader/TopLoader';
import RemarksModal from '../../CustomComponents/RemarksModal';
import CustomModal from '../../CustomComponents/CustomModal';
import Query from './Actions/Query';
import QuerySolve from './Actions/QuerySolve';
import AskRecommend from './Actions/AskRecommend';
import axios from 'axios';
import { ImageConfig } from '../../config/ImageConfig';
import ReOpenProcessModal from './Actions/ReOpenProcessModal';
import DocumentsVersionWise from './DocumentsVersionWise';
import ProcessDocumentUpload from '../../CustomComponents/ProcessDocumentUpload';
import DeleteConfirmationModal from '../../CustomComponents/DeleteConfirmation';
import EmailThreadModal, { normalizeRecipients } from './EmailThreadModal';
import { download } from '../../components/drop-file-input/FileUploadDownload';

const ViewProcess = () => {
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [searchParams] = useSearchParams();
  const [remarksModalOpen, setRemarksModalOpen] = useState({
    id: null,
    open: false,
  });
  const isCompleted = searchParams.get('completed') === 'true';
  const username = sessionStorage.getItem('username');
  const [showActions, setShowActions] = useState(false);
  const menuRef = useRef();
  const { id } = useParams();
  const [actionsLoading, setActionsLoading] = useState(false);
  const [process, setProcess] = useState(null);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fileView, setFileView] = useState(null);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [existingQuery, setExistingQuery] = useState(null);

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

  const [openModal, setOpenModal] = useState('');
  const [recommendations, setRecommendations] = useState([]);
  const [canEdit, setCanEdit] = useState({});
  const [showEmailThreadModal, setShowEmailThreadModal] = useState(false);
  const [autoOpenProcessed, setAutoOpenProcessed] = useState(false);
  const [selectedEmailThread, setSelectedEmailThread] = useState(null);
  const [expandedEmailThreads, setExpandedEmailThreads] = useState({});

  const [customSignModal, setCustomSignModal] = useState({
    open: false,
    id: null,
    remarks: '',
  });

  const disableActions = process?.currentStepType !== 'APPROVAL';

  const processDetails = [
    { label: 'Process ID', value: process?.processId },
    { label: 'Process Name', value: process?.processName || 'N/A' },
    { label: 'Process Version', value: process?.issueNo || 'N/A' },
    {
      label: 'Tag',
      value: process?.tags && process.tags.length > 0 ? (
        <span className="flex items-center gap-1 text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-xs w-max">
          <IconTag size={12} className="text-slate-500" />
          {process.tags[0]}
        </span>
      ) : 'N/A'
    },
    {
      label: 'PO Numbers',
      value: process?.poNumbers?.length > 0 ? (
        <div className="flex flex-wrap gap-1 mt-1">
          {process.poNumbers.map((po, i) => (
             <span key={i} className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-full font-bold">{po}</span>
          ))}
        </div>
      ) : 'None'
    },
    {
      label: 'Description',
      value: process?.description ? (
        <div
           className="w-full max-h-64 overflow-y-auto border border-slate-200 bg-white p-5 rounded-lg shadow-inner text-sm text-slate-700
              /* Lists Styling */
              [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-3 [&_ul]:space-y-1 
              [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-3 [&_ol]:space-y-1 
              /* Table Styling */
              [&_table]:w-full [&_table]:border-collapse [&_table]:mb-4 [&_table]:mt-2 [&_table]:bg-white [&_table]:block [&_table]:overflow-x-auto
              [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-slate-800
              [&_td]:border [&_td]:border-slate-300 [&_td]:px-4 [&_td]:py-2.5 [&_td]:align-top
              /* Typography */
              [&_b]:font-bold [&_strong]:font-bold 
              [&_i]:italic [&_em]:italic 
              [&_u]:underline
              [&_p]:mb-3 [&_p]:leading-relaxed
              [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-2 [&_h1]:text-slate-900
              [&_h2]:text-base [&_h2]:font-bold [&_h2]:mb-2 [&_h2]:text-slate-900
              [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mb-2 [&_h3]:text-slate-900
              [&_a]:text-blue-600 [&_a]:underline"
           dangerouslySetInnerHTML={{ __html: process.description }}
        />
      ) : 'N/A'
    },
    { label: 'Initiator Name', value: process?.initiatorName || 'Unknown' },
    {
      label: 'Status',
      value: (
        <span
          className={`px-3 py-1 rounded-full text-white text-[10px] font-bold uppercase tracking-wider inline-block mt-1 ${
            process?.status === 'PENDING' ? 'bg-amber-500' : 
            process?.status === 'PO_NO_ATTACHED' ? 'bg-blue-500' :
            'bg-emerald-500'
          }`}
        >
          {process?.status?.replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      label: 'Created At',
      value: process?.createdAt ? new Date(process?.createdAt).toLocaleString() : 'N/A',
    },
    {
      label: 'Updated At',
      value: process?.updatedAt
        ? new Date(process?.updatedAt).toLocaleString()
        : 'N/A',
    },
  ];

  const fetchProcess = async () => {
    try {
      const response = await GetProcessData(id);
      setProcess({
        ...response?.data?.process,
      });
      const editChecks = {};
      await Promise.all(
        response?.data?.process?.documents.map(async (doc) => {
          try {
            await axios.get(
              `http://localhost:${process.env.REACT_APP_API_PORT || 8000}/wopi/token/${doc.id}`,
              {
                headers: {
                  Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
              },
            );
            editChecks[doc.id] = true;
          } catch (err) {
            editChecks[doc.id] = false;
          }
        }),
      );
      setCanEdit(editChecks);
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  const DetailItem = ({ label, value }) => (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-slate-500 font-medium uppercase tracking-wide">{label}</span>
      <div className="text-base font-semibold text-slate-800 break-words">{value}</div>
    </div>
  );

  const handleDownloadConverted = async (docId, processId, fileName) => {
    setActionsLoading(true);
    try {
      await DownloadConvertedSignedPdf(docId, processId, fileName);
      toast.success("File converted and downloaded successfully");
    } catch (error) {
      toast.error("Failed to download converted file");
    } finally {
      setActionsLoading(false);
    }
  };

  const handleCompleteProcess = async (stepId) => {
    setActionsLoading(true);
    try {
      const response = await CompleteProcess(stepId);
      toast.success(response?.data?.message);
      navigate('/processes/work');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
    }
  };

  const handleClaim = async () => {
    setActionsLoading(true);
    try {
      const response = await ClaimProcess(
        process?.processId,
        process?.processStepInstanceId,
      );
      toast.success(response?.data?.message);
      setProcess((prev) => ({ ...prev, toBePicked: false }));
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
    }
  };

  const handleViewFile = async (name, path, fileId, type, isEditing) => {
    setActionsLoading(true);
    try {
      const fileData = await ViewDocument(name, path, type, fileId);
      setFileView(fileData);
    } catch (error) {
      console.error('Error:', error);
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
    }
  };

  const handleDownloadFile = async (name, path) => {
    setActionsLoading(true);
    await DownloadFile(name, path);
    setActionsLoading(false);
  };

  const [signAllModalOpen, setSignAllModalOpen] = useState({
    open: false,
    withRemarks: false,
    stepId: null,
    listOfDocuments: [],
  });

  const openModelSignAllDoec = async (stepId) => {
    setSignAllModalOpen({
      open: true,
      withRemarks: false,
      stepId,
      processStepInstanceId: process?.processStepInstanceId,
      processId: process?.processId,
      listOfDocuments: process.documents
        .filter((doc) => !doc.rejectionDetails) 
        .map((doc) => ({
          documentId: doc.id,
          name: doc.name,
          remarks: '',
        })),
    });
  };

  const handleSignAllDocuments = async () => {
    setActionsLoading(true);
    try {
      const res = await SignDocumentAll(
        process?.processId,
        process?.processStepInstanceId,
        signAllModalOpen.listOfDocuments.map((doc) => {
          const { remarks, name, ...rest } = doc;
          return signAllModalOpen.withRemarks ? { ...rest, remarks } : rest;
        }),
      );
      toast.success(res?.data?.message);
      await handleCompleteProcess(signAllModalOpen.stepId);
      setProcess((prev) => ({
        ...prev,
        documents: prev.documents.map((doc) =>
          signAllModalOpen.listOfDocuments.some((y) => y.documentId === doc.id)
            ? {
                ...doc,
                signedBy: [
                  ...doc?.signedBy,
                  { signedBy: username, remarks: '' },
                ],
              }
            : doc,
        ),
      }));
      setSignAllModalOpen({
        open: false,
        withRemarks: false,
        listOfDocuments: [],
      });
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
    }
  };

  // --- Added Clean Handlers for Approve All Modal ---
  const toggleRemarks = () => {
    setSignAllModalOpen((prev) => ({ ...prev, withRemarks: !prev.withRemarks }));
  };

  const handleRemarkChange = (index, value) => {
    setSignAllModalOpen((prev) => {
      const updatedDocuments = [...prev.listOfDocuments];
      updatedDocuments[index] = { ...updatedDocuments[index], remarks: value };
      return { ...prev, listOfDocuments: updatedDocuments };
    });
  };
  // ----------------------------------------------------

  const handleViewAllSelectedFiles = async () => {
    setActionsLoading(true);
    try {
      const selected = process.documents.filter((doc) =>
        selectedDocs.includes(doc.id),
      );
      const formattedDocs = await Promise.all(
        selected.map(async (doc) => {
          const res = await ViewDocument(
            doc.name,
            doc.path,
            doc.type,
            doc.id,
            false,
          );
          return res;
        }),
      );
      setFileView({ multi: true, docs: formattedDocs });
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
    }
  };

  const handleSignDocument = async (documentId, remarks = '') => {
    setActionsLoading(true);
    try {
      const res = await SignDocument(
        process?.processId,
        process?.processStepInstanceId,
        documentId,
        remarks,
      );
      toast.success(res?.data?.message);
      setCustomSignModal({ open: false, id: null, remarks: '' });
      setProcess((prev) => ({
        ...prev,
        documents: prev.documents.map((doc) =>
          doc.id === documentId
            ? {
                ...doc,
                signedBy: [...doc?.signedBy, { signedBy: username, remarks }],
              }
            : doc,
        ),
      }));
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
    }
  };

  const handleRejectDocument = async (remarks) => {
    setActionsLoading(true);
    try {
      const response = await RejectDocument(
        process.processId,
        remarksModalOpen.id,
        process?.processStepInstanceId,
        remarks,
      );
      setProcess((prev) => ({
        ...prev,
        documents: prev.documents.map((doc) =>
          doc.id === remarksModalOpen.id
            ? {
                ...doc,
                rejectionDetails: {
                  rejectedBy: username,
                  rejectionReason: remarks,
                  rejectedAt: new Date().toISOString(),
                  byRecommender: false,
                  isAttachedWithRecommendation: false,
                },
              }
            : doc,
        ),
      }));
      setRemarksModalOpen({ id: null, open: false });
      toast.success(response?.data?.message);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
    }
  };

  const handleRevokeSign = async (docId) => {
    setActionsLoading(true);
    try {
      const response = await SignRevoke(process.processId, docId);
      toast.success(response?.data?.message);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
    }
  };

  const handleRevokeRejection = async (docId) => {
    setActionsLoading(true);
    try {
      const response = await RevokeRejection(process.processId, docId);
      toast.success(response?.data?.message);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
    }
  };

  const handleSolveQuery = (query) => {
    setExistingQuery({
      queryText: query?.queryText,
      documentSummaries: query?.documentSummaries,
      documentChanges: [],
    });
  };

  const handleViewEmailThread = (thread) => {
    setSelectedEmailThread(thread);
    setShowEmailThreadModal(true);
  };

  const toggleEmailThreadExpansion = (threadId) => {
    setExpandedEmailThreads((prev) => ({
      ...prev,
      [threadId]: !prev[threadId],
    }));
  };

  function extractDocumentsByReopenCycle(processData) {
    const { documentVersioning } = processData;
    const allReopenCycles = new Set();
    const lineageMap = new Map();
    const newDocuments = [];

    documentVersioning.forEach((group) => {
      if (group.chains) {
        group.chains.forEach((chain) => {
          const versions = [...chain.versions].sort(
            (a, b) => a.reopenCycle - b.reopenCycle,
          );
          versions.forEach((v) => allReopenCycles.add(v.reopenCycle));
          const hasOriginal = versions.some((v) => v.reopenCycle === 0);
          if (hasOriginal) {
            lineageMap.set(chain.latestDocumentId, versions);
          } else {
            newDocuments.push(versions[0]);
          }
        });
      } else {
        const versions = [...group.versions].sort(
          (a, b) => a.reopenCycle - b.reopenCycle,
        );
        versions.forEach((v) => allReopenCycles.add(v.reopenCycle));
        const hasOriginal = versions.some((v) => v.reopenCycle === 0);
        if (hasOriginal) {
          lineageMap.set(
            group.latestDocumentId || versions[versions.length - 1].id,
            versions,
          );
        } else {
          newDocuments.push(versions[0]);
        }
      }
    });

    const reopenCycles = [...allReopenCycles].sort((a, b) => a - b);

    return reopenCycles.map((cycle) => {
      const documents = [];
      lineageMap.forEach((versions) => {
        let selected = null;
        for (let i = versions.length - 1; i >= 0; i--) {
          if (versions[i].reopenCycle <= cycle) {
            selected = versions[i];
            break;
          }
        }
        if (selected) documents.push(selected);
      });

      newDocuments.forEach((doc) => {
        if (doc.reopenCycle <= cycle) {
          documents.push(doc);
        }
      });

      const sopMatch = documents.find(
        (d) => d.reopenCycle === cycle && d.SOPIssueNo,
      );
      return {
        reopenCycle: cycle,
        SOPIssueNo: sopMatch?.SOPIssueNo || documents[0]?.SOPIssueNo || '--',
        documents: documents.filter(Boolean),
      };
    });
  }

  const DocumentsCycle = (process) => {
    const cycles = extractDocumentsByReopenCycle(process);

    if (cycles?.length === 0) return null;

    return (
      <CustomCard className="mt-8 shadow-sm border border-slate-200 rounded-xl overflow-hidden p-0 bg-white">
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
            <IconArrowForwardUp className="text-blue-500" size={20}/> Documents by Reopen Cycle
          </h2>
        </div>
        <div className="p-6 space-y-6">
          {cycles.map((cycle, index) => {
            const isLastCycle = index === cycles.length - 1;
            return (
              <div 
                key={cycle.reopenCycle} 
                className={`space-y-4 rounded-lg p-5 border transition-colors ${isLastCycle ? 'bg-emerald-50/30 border-emerald-100' : 'bg-white border-slate-100'}`}
              >
                <h3 className="font-bold text-slate-800 border-b border-slate-200 pb-2">
                  System Process Version {cycle.reopenCycle}
                </h3>
                <div className="flex flex-col space-y-3 pt-2">
                  {cycle.documents.map((doc, idx) => (
                    <div key={idx} className="flex items-center space-x-3 bg-white border border-slate-200 p-3 rounded-lg shadow-sm">
                      <img
                        width={28}
                        src={ImageConfig[doc.type] || ImageConfig['default']}
                        alt={doc.type}
                        className="shrink-0"
                      />
                      <div className="flex flex-col flex-1 min-w-0 mr-2">
                        <span
                          title={doc.name}
                          className={`truncate text-sm ${
                            doc.active
                              ? 'font-bold text-slate-800'
                              : 'text-slate-500 font-medium'
                          }`}
                        >
                          {doc.name}
                        </span>
                        <span className="text-[11px] text-blue-600 font-medium tracking-wide">
                          Version No: {doc?.issueNo || '--'}
                        </span>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <CustomButton
                          className="px-1.5 py-1 min-w-0"
                          size="xs"
                          click={() =>
                            handleViewFile(
                              doc.name,
                              doc.path,
                              doc.id,
                              doc.type,
                              false,
                            )
                          }
                          disabled={actionsLoading}
                          title="View Document"
                          text={<IconEye size={16} className="text-white" />}
                        />
                        <CustomButton
                          variant="info"
                          size="xs"
                          className="px-1.5 py-1 min-w-0"
                          click={() => setDocumentModalOpen(doc)}
                          disabled={actionsLoading}
                          title="Details"
                          text={<IconAlignBoxCenterMiddle size={16} className="text-white" />}
                        />
                      </div>
                    </div>
                  ))}
                  {cycle.documents.length === 0 && (
                    <div className="text-sm text-slate-400 italic">No documents in this cycle.</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CustomCard>
    );
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowActions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const GetRecommendations = async () => {
    try {
      const response = await getRecommendations();
      setRecommendations(response?.data?.recommendations);
    } catch (error) {
      console.error(error?.response?.data?.message || error?.message);
    }
  };

  const DeleteDocument = async (data) => {
    setActionsLoading(true);
    try {
      const res = await deleteDocumentInProcess(data);
      setProcess({
        ...process,
        documentVersioning: res?.data?.documentVersioning,
        documents: res?.data?.documents,
        sededDocuments: res?.data?.sededDocuments,
      });
      toast.success(res?.data?.message || 'Document Deleted');
      setOpenModal('');
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
    fetchProcess();
    GetRecommendations();
  }, [id]);

  useEffect(() => {
    if (!process?.documents || autoOpenProcessed) return;

    const autoOpenDoc = searchParams.get('autoOpenDoc');

    if (autoOpenDoc) {
      setAutoOpenProcessed(true);

      const documentToOpen = process.documents.find(
        (doc) => doc.id.toString() === autoOpenDoc || doc.id === autoOpenDoc,
      );

      if (documentToOpen) {
        setTimeout(() => {
          handleViewFile(
            documentToOpen.name,
            documentToOpen.path,
            documentToOpen.id,
            documentToOpen.type?.toLowerCase() || 'pdf',
            false,
          );
        }, 500);

        const url = new URL(window.location);
        url.searchParams.delete('autoOpenDoc');
        window.history.replaceState({}, '', url.toString());
      }
    }
  }, [process?.documents, searchParams, autoOpenProcessed]);

  useEffect(() => {
    if (process?.documents) {
      const autoOpenDoc = searchParams.get('autoOpenDoc');
      if (!autoOpenDoc) {
        setAutoOpenProcessed(false);
      }
    }
  }, [process?.documents, searchParams]);

  useEffect(() => {
    const hasUnsolvedQueries = process?.queryDetails?.some(
      (query) => !query.answerText,
    );

    if (hasUnsolvedQueries) {
      const querySection = document.getElementById('queries-section');
      if (querySection) {
        querySection.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [process?.queryDetails]);

  const handleDownload = (path, name) => {
    try {
      download(name, path);
    } catch (error) {
      console.error('Error downloading file:', error);
      toast.error('An error occurred while downloading the file.');
    }
  };

  if (loading) return <ComponentLoader />;
  if (error)
    return (
      <div className="w-full max-w-7xl mx-auto p-4 md:p-6 pb-12">
        <CustomCard className="border border-red-200 bg-red-50 text-center py-12 shadow-sm rounded-xl">
          <IconAlertSquareRoundedFilled className="mx-auto text-red-500 mb-4" size={48} />
          <p className="text-xl font-bold text-red-800">Something went wrong</p>
          <p className="text-red-600 mt-2 mb-6">{error}</p>
          <CustomButton
            click={() => navigate('/processes/work')}
            text={'Go Back'}
            variant="primary"
          />
        </CustomCard>
      </div>
    );

  const isInitiator =
    process?.initiatorName === sessionStorage.getItem('username');

  if (!process)
    return (
      <div className="text-center text-slate-500 py-20 bg-slate-50 rounded-xl min-h-[50vh] flex items-center justify-center flex-col shadow-sm">
        <IconFileText size={48} className="text-slate-300 mb-4" />
        <p className="text-lg font-medium text-slate-600">No process data available</p>
      </div>
    );

  return (
    <div className="w-full max-w-7xl mx-auto space-y-8 pb-12 p-4 sm:p-6 bg-slate-50 min-h-screen">
      {actionsLoading && <TopLoader />}

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-blue-100 p-3 rounded-lg text-blue-600">
            <IconActivity size={32} />
          </div>
          <div>
            <p className="text-l text-slate-500 font-medium">
              {process?.processName || 'Unnamed Process'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {!isInitiator && (
            <CustomButton
              text={'Approve'}
              click={() => openModelSignAllDoec(process?.processStepInstanceId)}
              className={'flex-1 lg:flex-none min-w-[140px] shadow-sm'}
            />
          )}
          {!isInitiator && (
            <CustomButton
              variant={'danger'}
              text={'Reject'}
              className={'flex-1 lg:flex-none min-w-[140px] shadow-sm'}
              click={() => setOpenModal('query')}
              disabled={actionsLoading || isCompleted || disableActions}
            />
          )}
          {isCompleted && !disableActions && (
            <CustomButton
              variant={'primary'}
              text={'Re-Open'}
              className={'flex-1 lg:flex-none min-w-[140px] shadow-sm'}
              click={() => setOpenModal('re-open')}
              disabled={actionsLoading}
            />
          )}
          <CustomButton
            variant={'primary'}
            text={'Upload Document'}
            className={'flex-1 lg:flex-none min-w-[140px] shadow-sm hidden'}
            click={() => setOpenModal('document-upload')}
            disabled={actionsLoading || !isCompleted || disableActions}
          />
          <CustomButton
            variant={'secondary'}
            text={'Ask Recommendation'}
            className={'flex-1 lg:flex-none min-w-[140px] shadow-sm'}
            click={() => setOpenModal('recommend')}
            disabled={actionsLoading || isCompleted || disableActions}
          />
          <CustomButton
            variant={'secondary'}
            text={'Activity Logs'}
            click={() => navigate(`/timeline/${process?.processId}`)}
            className={'flex-1 lg:flex-none min-w-[140px] shadow-sm'}
            disabled={actionsLoading}
          />
        </div>
      </div>

      <CustomCard className="border border-slate-200 shadow-sm rounded-xl overflow-hidden p-0 bg-white">
        <div className="bg-slate-50/50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <IconAlignBoxCenterMiddle className="text-slate-400" size={20}/>
                Process Details
            </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-y-6 gap-x-8 p-6">
          {processDetails.map((detail, index) => (
            <div key={index} className={detail.label === 'Description' ? "col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-4" : ""}>
              <DetailItem label={detail.label} value={detail.value} />
            </div>
          ))}
        </div>
      </CustomCard>

      {process?.queryDetails?.some((query) => !query.answerText) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm animate-pulse">
            <div className="flex items-center gap-3">
                <div className="bg-red-100 p-2 rounded-full text-red-600">
                    <IconAlertSquareRoundedFilled size={24} />
                </div>
                <div>
                    <h3 className="font-bold text-red-800">Attention Required</h3>
                    <p className="text-sm text-red-700">A query has been raised on this process. Please review and address it.</p>
                </div>
            </div>
            <CustomButton 
                variant="danger" 
                text="View Query" 
                size="sm"
                click={() => document.getElementById('queries-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            />
        </div>
      )}

      {process?.emailThreads?.length > 0 && (
        <section className="mt-8 space-y-6">
          <div className="flex items-center">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 px-4 py-1.5 bg-blue-50 border border-blue-100 rounded-full text-blue-800">
              <IconMail size={18} /> Email Conversations
              <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full ml-1">{process.emailThreads.length}</span>
            </h2>
            <div className="flex-grow border-t border-slate-200 ml-4"></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {process.emailThreads.map((thread, index) => {
              const participants = new Set();
              const threadEmails = thread.emails || [];
              const totalEmails = threadEmails.length;
              const totalAttachments = threadEmails.reduce(
                (sum, email) => sum + (email.attachments?.length || 0),
                0,
              );

              threadEmails.forEach((email) => {
                if (email.from)
                  participants.add(email.from.split('<')[0]?.trim());
                if (email.to)
                  normalizeRecipients(email.to).forEach((to) =>
                    participants.add(to.split('<')[0]?.trim()),
                  );
              });

              const participantsList = Array.from(participants).slice(0, 3);
              const hasMoreParticipants = participants.size > 3;
              const latestEmail = threadEmails[threadEmails.length - 1];
              const firstEmail = threadEmails[0];

              return (
                <div
                  key={thread.id || index}
                  className="group relative bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-md transition-all duration-300"
                >
                  <div className="absolute top-4 right-4">
                    <span
                      className={`px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase ${
                        totalAttachments > 0
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {totalAttachments > 0
                        ? `${totalAttachments} files`
                        : 'No files'}
                    </span>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shadow-sm">
                        <IconMail className="text-blue-500" size={24} />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="mb-3 mt-1">
                        <h3 className="font-bold text-slate-800 text-lg mb-2 pr-20 truncate">
                          {firstEmail?.subject || 'Email Conversation'}
                        </h3>

                        <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-500 mb-4">
                          <div className="flex items-center gap-1.5">
                            <IconMessageCircle size={14} className="text-blue-400"/>
                            <span>{totalEmails} messages</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <IconUser size={14} className="text-slate-400"/>
                            <span>{participants.size} participants</span>
                          </div>
                          {thread.extractedAt && (
                            <div className="flex items-center gap-1.5">
                              <IconClock size={14} className="text-slate-400"/>
                              <span>{formatDate(thread.extractedAt)}</span>
                            </div>
                          )}
                        </div>

                        {participantsList.length > 0 && (
                          <div className="mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                              <IconUsers size={14} />
                              <span>Participants</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {participantsList.map((participant, idx) => (
                                <span
                                  key={idx}
                                  className="px-2.5 py-1 bg-white border border-slate-200 rounded text-xs font-semibold text-slate-700 shadow-sm"
                                >
                                  {participant}
                                </span>
                              ))}
                              {hasMoreParticipants && (
                                <span className="px-2.5 py-1 bg-slate-200 text-slate-600 rounded text-xs font-semibold">
                                  +{participants.size - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {threadEmails.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                            <button
                              onClick={() => handleViewEmailThread(thread)}
                              disabled={actionsLoading}
                              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 hover:border-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <IconEye size={16} />
                              View Thread
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {process?.documents?.length > 0 && (
        <section className="mt-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 flex-grow">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 px-4 py-1.5 bg-emerald-50 border border-emerald-100 rounded-full text-emerald-800 whitespace-nowrap">
                <IconFileText size={18} /> Active Documents
                <span className="bg-emerald-600 text-white text-xs px-2 py-0.5 rounded-full ml-1">{process.documents.length}</span>
                </h2>
                <div className="flex-grow border-t border-slate-200 hidden sm:block"></div>
            </div>
            <div className="pl-4 shrink-0">
              <button
                disabled={selectedDocs.length === 0}
                onClick={handleViewAllSelectedFiles}
                className="flex items-center gap-2 ml-auto px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <IconEye size={16} />
                View Selected ({selectedDocs.length})
              </button>
            </div>
          </div>

         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {process.documents.map((doc) => {
              const isSelected = selectedDocs.includes(doc.id);
              const toggleSelect = () => {
                if (doc.type !== 'pdf') return;
                setSelectedDocs((prev) =>
                  isSelected
                    ? prev.filter((id) => id !== doc.id)
                    : [...prev, doc.id],
                );
              };

              const extension = doc.name?.split('.').pop()?.toLowerCase();
              return (
                <CustomCard
                  key={doc.id}
                  className={`relative flex flex-col justify-between border transition-all duration-200 shadow-sm ${isSelected ? 'border-blue-400 ring-1 ring-blue-100 bg-blue-50/20' : 'border-slate-200 hover:border-blue-300 hover:shadow-md bg-white'}`}
                >
                  <div className="absolute top-3 right-3 z-10">
                    {doc.rejectionDetails ? (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-800 px-2.5 py-1 rounded-full border border-red-200 shadow-sm">
                        Rejected
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200 shadow-sm">
                        Active
                      </span>
                    )}
                  </div>

                  <div className="flex items-start gap-4 mb-6 pt-1">
                    <div className="mt-1 shrink-0">
                        <label className="relative flex items-center cursor-pointer p-1">
                            <input
                                type="checkbox"
                                className="peer h-5 w-5 cursor-pointer transition-all appearance-none rounded border border-slate-300 checked:bg-blue-600 checked:border-blue-600 disabled:bg-slate-100 disabled:border-slate-200 disabled:cursor-not-allowed shadow-sm"
                                checked={isSelected}
                                disabled={doc.type !== 'pdf'}
                                onChange={toggleSelect}
                            />
                            <span className="absolute text-white opacity-0 peer-checked:opacity-100 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                                <IconCheck size={14} stroke={3} />
                            </span>
                        </label>
                    </div>
                    
                    <div className="w-12 h-12 shrink-0 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shadow-sm">
                      <img
                        width={28}
                        src={ImageConfig[extension] || ImageConfig['default']}
                        alt="icon"
                      />
                    </div>
                    
                    <div className="flex flex-col min-w-0 pr-14">
                      <p className="font-bold text-slate-800 break-words leading-tight mb-1" title={doc.name}>
                        {doc.name}
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs font-medium mt-1">
                        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 uppercase">
                          {extension || 'Unknown'}
                        </span>
                        {doc.issueNo && (
                          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                            v{doc.issueNo}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Document specific formatted description render with responsive table support */}
                  {doc.description && (
                     <div className="mb-4 mx-4 bg-slate-50 p-4 rounded-lg border border-slate-200 max-h-48 overflow-y-auto text-sm text-slate-700 shadow-inner
                            [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-2 [&_ul]:space-y-1
                            [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-2 [&_ol]:space-y-1
                            [&_table]:w-full [&_table]:border-collapse [&_table]:mb-3 [&_table]:bg-white [&_table]:block [&_table]:overflow-x-auto
                            [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold
                            [&_td]:border [&_td]:border-slate-300 [&_td]:px-3 [&_td]:py-2
                            [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline 
                            [&_p]:mb-2 [&_p]:leading-relaxed [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-bold"
                          dangerouslySetInnerHTML={{ __html: doc.description }}>
                     </div>
                  )}

                  <div className="mt-auto pt-4 border-t border-slate-100 flex flex-wrap justify-end gap-2 bg-slate-50/50 -mx-4 -mb-4 p-4 rounded-b-xl">
                    <CustomButton
                      className="px-2 shadow-sm"
                      click={() =>
                        handleViewFile(
                          doc.name,
                          doc.path,
                          doc.id,
                          extension,
                          false,
                        )
                      }
                      disabled={actionsLoading}
                      title="View Document"
                      text={<IconEye size={18} className="text-white" />}
                    />
                    <CustomButton
                      variant="info"
                      className="px-2 shadow-sm"
                      click={() => setDocumentModalOpen(doc)}
                      disabled={actionsLoading}
                      title="Details"
                      text={<IconAlignBoxCenterMiddle size={18} className="text-white" />}
                    />
                    <CustomButton
                      variant="danger"
                      className="px-2 shadow-sm"
                      click={() =>
                        setOpenModal({
                          documentId: doc.id,
                          documentName: doc.name,
                          modal: 'delete-confirmation',
                        })
                      }
                      disabled={
                        actionsLoading ||
                        doc?.signedBy?.length > 0 ||
                        doc?.rejectionDetails ||
                        !isCompleted ||
                        disableActions
                      }
                      title="Delete"
                      text={<IconTrash size={18} className="text-white" />}
                    />
                    <CustomButton
                      className="px-2 shadow-sm"
                      click={() => handleDownload(doc.path, doc.name)}
                      title="Download Original Document"
                      text={<IconDownload size={18} className="text-white" />}
                    />
                  </div>
                </CustomCard>
              );
            })}
          </div>
        </section>
      )}

      {process && DocumentsCycle(process)}

      {process?.sededDocuments?.length > 0 && (
        <section className="mt-12 space-y-6">
          <div className="flex items-center">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 px-4 py-1.5 bg-rose-50 border border-rose-100 rounded-full text-rose-800">
              <IconArrowBackUp size={18} /> Superseded Documents
              <span className="bg-rose-600 text-white text-xs px-2 py-0.5 rounded-full ml-1">{process.sededDocuments.length}</span>
            </h2>
            <div className="flex-grow border-t border-slate-200 ml-4"></div>
          </div>

          <div className="space-y-6">
            {process?.sededDocuments.map((docGroup, index) => {
              const ext = docGroup?.documentWhichSuperseded?.name
                ?.split('.')
                .pop()
                ?.toLowerCase();
              return (
                <CustomCard
                  key={index}
                  className="relative border border-rose-200 bg-white shadow-sm rounded-xl p-5"
                >
                  <div className="absolute top-4 right-4 z-10">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 px-2.5 py-1 rounded-full border border-rose-200 shadow-sm">
                      Superseded
                    </span>
                  </div>

                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center shadow-sm shrink-0">
                        <img
                          width={28}
                          src={ImageConfig[ext] || ImageConfig['default']}
                          alt="icon"
                        />
                      </div>
                      <div className="min-w-0 pt-1 pr-16">
                        <p className="font-bold text-slate-800 break-words mb-1">
                          {docGroup.documentWhichSuperseded.name}
                        </p>
                        <p className="text-xs font-medium text-slate-500 truncate mb-2">
                          Path: {docGroup.documentWhichSuperseded.path}
                        </p>
                        {docGroup.documentWhichSuperseded.issueNo && (
                          <span className="inline-block bg-rose-50 text-rose-700 px-2 py-0.5 rounded border border-rose-200 text-xs font-bold">
                            Version: {docGroup.documentWhichSuperseded.issueNo}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex gap-2 shrink-0 md:pt-1">
                      <CustomButton
                        className="px-2 shadow-sm"
                        click={() =>
                          handleViewFile(
                            docGroup.documentWhichSuperseded.name,
                            docGroup.documentWhichSuperseded.path,
                            docGroup.documentWhichSuperseded.id,
                            docGroup.documentWhichSuperseded.type,
                          )
                        }
                        title="View Document"
                        text={<IconEye size={18} className="text-white" />}
                      />
                      <CustomButton
                        variant="info"
                        className="px-2 shadow-sm"
                        click={() =>
                          setDocumentModalOpen(docGroup.documentWhichSuperseded)
                        }
                        disabled={actionsLoading}
                        title="Details"
                        text={
                          <IconAlignBoxCenterMiddle
                            size={18}
                            className="text-white"
                          />
                        }
                      />
                    </div>
                  </div>

                  {docGroup.versions.length > 0 && (
                    <div className="mt-4 bg-slate-50 rounded-lg p-5 border border-slate-200 relative">
                      <div className="absolute top-0 bottom-0 left-[2rem] w-px bg-rose-200 hidden sm:block"></div>
                      
                      <p className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <IconActivity size={16} className="text-rose-400"/>
                        Version History <span className="text-slate-500 font-medium">({docGroup.versions.length} versions)</span>
                      </p>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10 sm:pl-10">
                        {docGroup.versions.map((ver) => {
                          const prevExt = ver.name
                            ?.split('.')
                            .pop()
                            ?.toLowerCase();
                          return (
                            <div
                              key={ver.id}
                              className="flex flex-col justify-between bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow"
                            >
                              <div className="flex gap-3 mb-3">
                                <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                                  <img
                                    width={22}
                                    src={
                                      ImageConfig[prevExt] ||
                                      ImageConfig['default']
                                    }
                                    alt="icon"
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-bold text-slate-800 break-words leading-tight mb-1" title={ver.name}>
                                    {ver.name}
                                  </p>
                                  <p className="text-[10px] text-slate-500 truncate mb-1">
                                    {ver.path}
                                  </p>
                                  {ver.issueNo && (
                                    <span className="inline-block bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                      v{ver.issueNo}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2 justify-end pt-3 border-t border-slate-100 mt-auto">
                                <CustomButton
                                  className="px-2"
                                  variant="info"
                                  size="xs"
                                  click={() =>
                                    handleViewFile(
                                      ver.name,
                                      ver.path,
                                      ver.id,
                                      prevExt,
                                    )
                                  }
                                  title="View Document"
                                  text={
                                    <IconEye size={16} className="text-white" />
                                  }
                                />
                                <CustomButton
                                  variant="info"
                                  className="px-2"
                                  click={() => setDocumentModalOpen(ver)}
                                  disabled={actionsLoading}
                                  title="Details"
                                  text={
                                    <IconAlignBoxCenterMiddle
                                      size={18}
                                      className="text-white"
                                    />
                                  }
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CustomCard>
              );
            })}
          </div>
        </section>
      )}

      {process?.queryDetails?.length > 0 && (
        <section id="queries-section" className="mt-12 space-y-6">
          <div className="flex items-center">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 px-4 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-amber-800">
              <IconQuestionMark size={18} /> Queries & Clarifications
              <span className="bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full ml-1">{process.queryDetails.length}</span>
            </h2>
            <div className="flex-grow border-t border-slate-200 ml-4"></div>
          </div>

          <div className="space-y-6">
            {process?.queryDetails?.map((query, index) => {
              const isResolved = !!query.answerText;
              const assigneeName =
                query.assigneeDetails?.assignedAssigneeName || 'Unknown User';
              const assigneeStep =
                query.assigneeDetails?.assignedStepName || 'Unknown Step';

              const getDocumentName = (id, fallbackObj) => {
                if (fallbackObj?.name) return fallbackObj.name;
                const found = process.documents?.find((d) => d.id === id);
                return found?.name || `Document ID: ${id}`;
              };

              return (
                <CustomCard
                  key={index}
                  className={`border-l-4 overflow-hidden shadow-sm rounded-xl p-0 ${
                    isResolved ? 'border-l-emerald-500 border-y-slate-200 border-r-slate-200' : 'border-l-amber-500 border-y-amber-200 border-r-amber-200 bg-amber-50/10'
                  }`}
                >
                  <div className="p-6">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-6 gap-4 border-b pb-6 border-slate-100">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-bold text-xl text-slate-800">
                              {query.stepName
                                ? `Query at ${query.stepName}`
                                : 'Process Query'}
                            </h3>
                            <span
                              className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-sm ${
                                isResolved
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-amber-100 text-amber-800 border-amber-300'
                              }`}
                            >
                              {isResolved ? 'Resolved' : 'Pending Resolution'}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-slate-500 mt-3 bg-slate-50 inline-flex p-3 rounded-lg border border-slate-100">
                            <div className="flex items-center gap-2">
                              <div className="bg-slate-200 p-1 rounded text-slate-600"><IconAt size={14} /></div>
                              <span>
                                <strong className="text-slate-700">Raised by:</strong>{' '}
                                {query.initiatorName || 'Process Reviewer'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="bg-blue-100 p-1 rounded text-blue-600"><IconUser size={14} /></div>
                              <span>
                                <strong className="text-slate-700">Assigned to:</strong>{' '}
                                {assigneeName}{' '}
                                <span className="text-slate-400">({assigneeStep})</span>
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="bg-slate-200 p-1 rounded text-slate-600"><IconClock size={14} /></div>
                              <span>
                                <strong className="text-slate-700">Created:</strong>{' '}
                                {new Date(query.createdAt).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50/80 p-5 rounded-xl border border-slate-200 mb-6 shadow-inner">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                          <IconAlertSquareRoundedFilled
                            size={16}
                            className="text-amber-500"
                          />
                          Query Description
                        </p>
                        <p className="text-slate-800 whitespace-pre-wrap text-sm leading-relaxed font-medium">
                          {query.queryText || (
                            <span className="text-slate-400 italic font-normal">
                              No description provided.
                            </span>
                          )}
                        </p>
                      </div>

                      {query.documentSummaries?.length > 0 && (
                        <div className="mb-6">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                              <IconFileText size={16} className="text-slate-400"/>
                            Document Specific Feedback
                          </p>
                          <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
                            <table className="min-w-full text-sm text-left">
                              <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
                                <tr>
                                  <th className="p-4 font-bold uppercase text-xs tracking-wider w-1/3">
                                    Document
                                  </th>
                                  <th className="p-4 font-bold uppercase text-xs tracking-wider">Feedback</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 bg-white">
                                {query.documentSummaries.map((ds) => (
                                  <tr
                                    key={ds.documentId}
                                    className="hover:bg-slate-50 transition-colors"
                                  >
                                    <td className="p-4 font-semibold text-slate-800 align-top break-words border-r border-slate-100">
                                      {getDocumentName(
                                        ds.documentId,
                                        ds.documentDetails,
                                      )}
                                    </td>
                                    <td className="p-4 text-slate-600 align-top whitespace-pre-wrap font-medium">
                                      {ds.feedbackText}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {isResolved && (
                        <div className="bg-emerald-50 p-6 rounded-xl border border-emerald-200 mt-8 relative shadow-sm">
                          <div className="absolute -top-3 left-6 bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded shadow-md flex items-center gap-1.5">
                            <IconCheck size={14} stroke={3} /> Query Resolved
                          </div>

                          <div className="pt-2">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded flex items-center gap-2 border border-emerald-200 shadow-sm">
                                <IconMessageCircle size={16} className="text-emerald-600"/>
                                Resolution Provided
                              </div>
                              <div className="flex-grow border-t border-dashed border-emerald-300"></div>
                            </div>

                            <div className="bg-white p-5 rounded-lg border border-emerald-100 shadow-sm">
                              <p className="text-slate-800 whitespace-pre-wrap text-sm leading-relaxed font-medium">
                                {query.answerText}
                              </p>
                            </div>

                            {query.answeredAt && (
                              <div className="flex justify-end mt-3">
                                <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1.5 bg-emerald-100/50 px-2.5 py-1 rounded-md">
                                  <IconClock size={14} />
                                  Resolved on{' '}
                                  {new Date(query.answeredAt).toLocaleString()}
                                </span>
                              </div>
                            )}
                          </div>

                          {query.documentChanges?.length > 0 && (
                            <div className="mt-6 border-t border-emerald-200 pt-5">
                              <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <IconPaperclip size={16} />
                                Documents Updated in Resolution
                              </p>
                              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {query.documentChanges.map((dc, idx) => {
                                  const docName = getDocumentName(
                                    dc.documentId,
                                    dc.document,
                                  );
                                  const replacedDocName = dc.replacedDocument?.name;

                                  return (
                                    <li
                                      key={idx}
                                      className="bg-white border border-emerald-200 p-4 rounded-lg flex items-start gap-4 shadow-sm"
                                    >
                                      <div className={`p-2 rounded-lg shrink-0 ${dc.isReplacement ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                          <IconFileText size={20} />
                                      </div>
                                      <div className="flex flex-col min-w-0">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                          {dc.isReplacement
                                            ? 'Replaced Document'
                                            : 'New Document'}
                                        </span>
                                        <span className="text-slate-800 font-bold break-words text-sm leading-tight">
                                          {docName}
                                        </span>
                                        {dc.isReplacement && replacedDocName && (
                                          <span className="text-[11px] text-slate-500 mt-1.5 flex flex-col gap-0.5">
                                            <span className="font-semibold text-amber-600">Replaced:</span> 
                                            <span className="line-through truncate" title={replacedDocName}>
                                              {replacedDocName}
                                            </span>
                                          </span>
                                        )}
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {!isResolved && query.documentChanges?.length > 0 && (
                        <div className="mb-6 bg-blue-50/50 p-5 rounded-xl border border-blue-100">
                          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <IconPaperclip size={16} className="text-blue-500" />
                            Targeted Documents
                          </p>
                          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {query.documentChanges.map((dc, idx) => {
                              const docName = getDocumentName(
                                dc.documentId,
                                dc.document,
                              );
                              const replacedDocName = dc.replacedDocument?.name;

                              return (
                                <li
                                  key={idx}
                                  className="bg-white border border-slate-200 p-4 rounded-lg flex items-start gap-4 shadow-sm"
                                >
                                  <div className={`p-2 rounded-lg shrink-0 ${dc.isReplacement ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                                    <IconFileText size={20} />
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${dc.isReplacement ? 'text-amber-600' : 'text-blue-600'}`}>
                                      {dc.isReplacement
                                        ? 'Replacement Required'
                                        : 'Action Required'}
                                    </span>
                                    <span className="text-slate-800 font-bold break-words text-sm leading-tight">
                                      {docName}
                                    </span>
                                    {dc.isReplacement && replacedDocName && (
                                      <span className="text-[11px] text-slate-500 mt-1.5">
                                        <span className="font-semibold text-amber-600 block">To Replace:</span> 
                                        <span className="truncate block" title={replacedDocName}>{replacedDocName}</span>
                                      </span>
                                    )}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}

                      {!isResolved && (
                        <div className="mt-8 pt-6 border-t border-amber-200 flex justify-end">
                          <CustomButton
                            disabled={
                              actionsLoading || isCompleted || disableActions
                            }
                            text="Solve Query"
                            variant="primary"
                            className="shadow-md px-6 py-2.5"
                            click={() => handleSolveQuery(query)}
                          />
                        </div>
                      )}
                  </div>
                </CustomCard>
              );
            })}
          </div>
        </section>
      )}

      {process?.recommendationDetails?.length > 0 && (
        <section className="mt-12 space-y-6">
          <div className="flex items-center">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 px-4 py-1.5 bg-indigo-50 border border-indigo-100 rounded-full text-indigo-800">
              <IconUsers size={18} /> Recommendations
              <span className="bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full ml-1">{process.recommendationDetails.length}</span>
            </h2>
            <div className="flex-grow border-t border-slate-200 ml-4"></div>
          </div>
          
          <div className="space-y-6">
            {process?.recommendationDetails?.map((rec, index) => (
              <CustomCard key={rec.recommendationId || index} className="border border-indigo-100 shadow-sm rounded-xl p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 mb-6 text-sm text-slate-700 bg-slate-50 p-4 rounded-lg border border-slate-100">
                  <p className="flex items-center gap-2">
                    <span className="font-bold text-slate-500 uppercase text-xs w-24">Step:</span> 
                    <span className="font-semibold text-slate-800">{rec.stepName} (#{rec.stepNumber})</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="font-bold text-slate-500 uppercase text-xs w-24">Status:</span> 
                    <span className="font-bold px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[10px] uppercase tracking-wider">{rec.status}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="font-bold text-slate-500 uppercase text-xs w-24">Initiator:</span> 
                    <span className="font-medium">{rec.initiatorName}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="font-bold text-slate-500 uppercase text-xs w-24">Recommender:</span> 
                    <span className="font-medium bg-blue-50 text-blue-700 px-2 rounded">{rec.recommenderName}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="font-bold text-slate-500 uppercase text-xs w-24">Created:</span> 
                    <span className="text-slate-500">{new Date(rec.createdAt).toLocaleString()}</span>
                  </p>
                  {rec.respondedAt && (
                    <p className="flex items-center gap-2">
                      <span className="font-bold text-slate-500 uppercase text-xs w-24">Responded:</span> 
                      <span className="text-emerald-600 font-medium">{new Date(rec.respondedAt).toLocaleString()}</span>
                    </p>
                  )}
                </div>
                
                <div className="space-y-4">
                    <div className="bg-white border border-slate-200 p-4 rounded-lg shadow-sm">
                        <span className="font-bold text-slate-800 block mb-2 text-sm flex items-center gap-2"><IconMessageCircle size={16} className="text-indigo-500"/> Recommendation:</span> 
                        <p className="text-slate-600 font-medium whitespace-pre-wrap text-sm">{rec.recommendationText}</p>
                    </div>
                    {rec.responseText && (
                    <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-lg shadow-sm">
                        <span className="font-bold text-emerald-800 block mb-2 text-sm flex items-center gap-2"><IconCheck size={16} /> Response:</span> 
                        <p className="text-emerald-700 font-medium whitespace-pre-wrap text-sm">{rec.responseText}</p>
                    </div>
                    )}
                </div>

                {rec.documentDetails?.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-slate-100">
                    <p className="font-bold text-slate-800 mb-3 flex items-center gap-2"><IconPaperclip size={18} className="text-slate-400"/> Attached Documents</p>
                    <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
                      <table className="min-w-full text-sm text-left">
                        <thead className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider text-xs border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3">Document Name</th>
                            <th className="px-4 py-3 border-l border-slate-200">Query Text</th>
                            <th className="px-4 py-3 border-l border-slate-200">Answer Text</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100">
                          {rec.documentDetails.map((doc) => (
                            <tr key={doc.documentId} className="hover:bg-slate-50">
                              <td className="px-4 py-3 font-semibold text-slate-800">
                                {doc.documentName}
                              </td>
                              <td className="px-4 py-3 border-l border-slate-100 text-slate-600 font-medium whitespace-pre-wrap">
                                {doc.queryText || <span className="text-slate-400 italic">-</span>}
                              </td>
                              <td className="px-4 py-3 border-l border-slate-100 text-emerald-700 font-medium whitespace-pre-wrap">
                                {doc.answerText || <span className="text-slate-400 italic">-</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CustomCard>
            ))}
          </div>
        </section>
      )}

      {fileView && (
        <ViewFile
          docu={fileView}
          setFileView={setFileView}
          handleViewClose={() => setFileView(null)}
        />
      )}

      {documentModalOpen ? (
        <CustomModal
          isOpen={!!documentModalOpen}
          onClose={() => setDocumentModalOpen(false)}
          className={'max-h-[95vh] overflow-auto max-w-2xl w-full rounded-xl'}
        >
          <div className="p-2 sm:p-4 space-y-8 text-sm text-slate-800">
            <h2 className="text-xl font-bold text-slate-900 border-b border-slate-200 pb-3 flex items-center gap-2">
              <IconAlignBoxCenterMiddle className="text-blue-500"/> Document Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8 bg-slate-50 p-6 rounded-xl border border-slate-100">
              <DetailItem
                label="Name"
                value={documentModalOpen?.name || '--'}
              />
              <div className="md:col-span-2">
                <DetailItem
                    label="Description"
                    value={
                        documentModalOpen?.description ? (
                            <div className="max-h-64 overflow-y-auto bg-white p-5 rounded-lg border border-slate-200 text-sm text-slate-700 shadow-sm
                                [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-2 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-2 [&_ol]:space-y-1
                                [&_table]:w-full [&_table]:border-collapse [&_table]:mb-3 [&_table]:bg-white [&_table]:block [&_table]:overflow-x-auto
                                [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:px-4 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold
                                [&_td]:border [&_td]:border-slate-300 [&_td]:px-4 [&_td]:py-2
                                [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline 
                                [&_p]:mb-2 [&_p]:leading-relaxed [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-bold"
                            dangerouslySetInnerHTML={{ __html: documentModalOpen.description }} />
                        ) : '--'
                    }
                />
              </div>
              <DetailItem
                label="Created At"
                value={
                  documentModalOpen?.createdAt
                    ? new Date(documentModalOpen?.createdAt).toLocaleString()
                    : '--'
                }
              />
              <DetailItem
                label="Issue No"
                value={documentModalOpen?.issueNo || '--'}
              />
              <DetailItem
                label="Process SOP"
                value={documentModalOpen?.SOPIssueNo || '--'}
              />
              <DetailItem
                label="Prev-approved"
                value={documentModalOpen?.preApproved ? 'Yes' : 'No'}
              />
              <DetailItem
                label="Part-Number"
                value={documentModalOpen?.partNumber || '--'}
              />
              <DetailItem
                label="Type"
                value={documentModalOpen?.type?.toUpperCase() || '--'}
              />
              <DetailItem
                label="Approval Count"
                value={documentModalOpen?.approvalCount || '--'}
              />
            </div>

            <div className="space-y-4">
              <h3 className="text-base font-bold text-slate-800 border-b border-slate-200 pb-2 flex items-center gap-2">
                <IconPencil size={18} className="text-blue-500"/> Signatures
              </h3>
              {documentModalOpen?.signedBy?.length > 0 ? (
                <ul className="space-y-3">
                  {documentModalOpen?.signedBy?.map((entry, idx) => (
                    <li key={idx} className="bg-white border border-slate-200 p-3 rounded-lg shadow-sm">
                      <div className="flex justify-between items-start flex-wrap gap-2">
                        <span className="font-bold text-slate-800 flex items-center gap-2"><IconUser size={16} className="text-slate-400"/> {entry.signedBy}</span>
                        <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded">
                          {new Date(entry.signedAt).toLocaleString()}
                        </span>
                      </div>
                      {entry.remarks && (
                        <div className="mt-2 text-sm text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                          <span className="font-semibold block mb-1">Remarks:</span> {entry.remarks}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-slate-400 italic block py-2 px-4 bg-slate-50 rounded-lg border border-slate-100">No signatures yet.</span>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="text-base font-bold text-slate-800 border-b border-slate-200 pb-2 flex items-center gap-2">
                <IconX size={18} className="text-red-500"/> Rejection Details
              </h3>
              {documentModalOpen?.rejectionDetails ? (
                <div className="bg-red-50 border border-red-100 p-4 rounded-lg space-y-2 text-sm shadow-sm">
                  <p className="flex items-center gap-2">
                    <span className="font-bold text-red-800 w-24">Rejected By:</span>{' '}
                    <span className="font-semibold text-red-900">{documentModalOpen?.rejectionDetails.rejectedBy}</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="font-bold text-red-800 w-24 shrink-0">Reason:</span>{' '}
                    <span className="text-red-700 font-medium">{documentModalOpen?.rejectionDetails.rejectionReason}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="font-bold text-red-800 w-24">Date:</span>{' '}
                    <span className="text-red-700 font-medium">{new Date(documentModalOpen?.rejectionDetails.rejectedAt).toLocaleString()}</span>
                  </p>
                </div>
              ) : (
                <span className="text-slate-400 italic block py-2 px-4 bg-slate-50 rounded-lg border border-slate-100">No rejection records.</span>
              )}
            </div>
          </div>
        </CustomModal>
      ) : null}

      <CustomModal
        isOpen={customSignModal.open}
        onClose={() =>
          setCustomSignModal({ open: false, id: null, remarks: '' })
        }
        className={'max-h-[95vh] overflow-auto max-w-lg w-full rounded-xl'}
      >
        <div className="p-6">
          <h2 className="text-xl font-bold mb-2 text-slate-800 flex items-center gap-2"><IconPencil className="text-blue-500"/> Sign Document</h2>
          <p className="mb-6 text-slate-500 text-sm">
            Provide optional remarks before signing. Leave blank if not required.
          </p>
          <div className="mb-6">
            <label className="block text-sm font-bold text-slate-700 mb-2">
              Remarks (optional)
            </label>
            <textarea
              value={customSignModal.remarks}
              onChange={(e) =>
                setCustomSignModal({
                  ...customSignModal,
                  remarks: e.target.value,
                })
              }
              className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-y shadow-sm"
              rows={4}
              placeholder="Enter your remarks here..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <CustomButton
              variant="secondary"
              text="Cancel"
              className="bg-white"
              click={() =>
                setCustomSignModal({ open: false, id: null, remarks: '' })
              }
            />
            <CustomButton
              variant="primary"
              text="Sign Document"
              click={() =>
                handleSignDocument(customSignModal.id, customSignModal.remarks)
              }
              disabled={actionsLoading}
            />
          </div>
        </div>
      </CustomModal>

      {showEmailThreadModal && selectedEmailThread && (
        <EmailThreadModal
          thread={selectedEmailThread}
          onClose={() => {
            setShowEmailThreadModal(false);
            setSelectedEmailThread(null);
          }}
        />
      )}

      <CustomModal
        isOpen={openModal == 'query'}
        onClose={() => {
          setOpenModal('');
          setExistingQuery(null);
        }}
        className={'max-h-[95vh] overflow-auto max-w-lg w-full rounded-xl'}
      >
        <Query
          workflowId={process?.workflow?.id}
          processId={process.processId}
          storagePath={process.processStoragePath}
          steps={process?.steps}
          close={() => {
            setOpenModal('');
            setExistingQuery(null);
          }}
          stepInstanceId={process.processStepInstanceId}
          documents={process.documents}
        />
      </CustomModal>

      <CustomModal
        isOpen={openModal == 'version-wise'}
        onClose={() => {
          setOpenModal('');
        }}
        className={'max-h-[95vh] overflow-auto max-w-lg w-full rounded-xl'}
      >
        <DocumentsVersionWise
          processId={process.processId}
          close={() => setOpenModal('')}
        />
      </CustomModal>

      <CustomModal
        isOpen={openModal == 'document-upload'}
        onClose={() => {
          setOpenModal('');
        }}
        className={'max-h-[95vh] overflow-auto max-w-lg w-full rounded-xl'}
      >
        <ProcessDocumentUpload
          processId={process.processId}
          workflowId={process?.workflow?.id}
          issueNo={process.issueNo}
          onFinish={(data) => {
            setProcess({
              ...process,
              documentVersioning: data.documentVersioning,
              documents: data.documents,
              sededDocuments: data.sededDocuments,
            });
            setOpenModal('');
          }}
        />
      </CustomModal>

      <CustomModal
        isOpen={existingQuery}
        onClose={() => {
          setExistingQuery(null);
        }}
        className={'max-h-[95vh] overflow-auto max-w-lg w-full rounded-xl'}
      >
        <QuerySolve
          workflowId={process?.workflow?.id}
          processId={process.processId}
          storagePath={process.processStoragePath}
          close={() => {
            setExistingQuery(null);
          }}
          stepInstanceId={process.processStepInstanceId}
          queryRaiserStepInstanceId={process?.queryDetails[0]?.stepInstanceId}
          existingQuery={existingQuery}
          documents={process.documents} 
        />
      </CustomModal>

      <CustomModal
        isOpen={openModal == 'recommend'}
        onClose={() => {
          setOpenModal('');
        }}
        className={'max-h-[95vh] overflow-auto max-w-lg w-full rounded-xl'}
      >
        <AskRecommend
          processId={process.processId}
          close={() => {
            setOpenModal('');
          }}
          initiatorName={process?.initiatorName || ''}
          stepInstanceId={process.processStepInstanceId}
          documents={process.documents}
        />
      </CustomModal>

      <CustomModal
        isOpen={openModal == 're-open'}
        onClose={() => {
          setOpenModal('');
        }}
        className={'max-h-[95vh] overflow-auto max-w-lg w-full rounded-xl'}
      >
        <ReOpenProcessModal
          workflowId={process?.workflow?.id}
          processId={process.processId}
          storagePath={process.processStoragePath}
          close={() => {
            setOpenModal('');
          }}
          documents={process.documents}
        />
      </CustomModal>

      <CustomModal
        isOpen={signAllModalOpen.open}
        onClose={() => {
          setSignAllModalOpen({
            open: false,
            withRemarks: false,
            listOfDocuments: [],
          });
        }}
        className={'max-h-[90vh] flex flex-col max-w-2xl w-full rounded-xl overflow-hidden bg-white'}
      >
        <div className="px-6 py-5 border-b border-slate-100 bg-white z-10 shrink-0">
          <h2 className="text-xl font-bold mb-1 text-slate-800 flex items-center gap-2">
            <IconCheck className="text-emerald-500" size={24} /> 
            Approve All Documents
          </h2>
          <p className="text-slate-500 text-sm">
            You are about to approve {signAllModalOpen.listOfDocuments.length} valid PDF document(s).
          </p>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 bg-slate-50/50">
          {signAllModalOpen.listOfDocuments.length > 0 && (
            <div className="flex flex-col gap-5">
              
              <label className="flex items-center p-4 bg-white rounded-lg border border-slate-200 shadow-sm cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  name="signWithRemarks"
                  className="w-5 h-5 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                  checked={signAllModalOpen.withRemarks}
                  onChange={toggleRemarks}
                />
                <span className="ml-3 font-semibold text-slate-700">
                  Add remarks to documents
                </span>
              </label>

              {signAllModalOpen.withRemarks && (
                <div className="flex flex-col gap-4">
                  {signAllModalOpen.listOfDocuments.map((doc, index) => (
                    <div key={index} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                      <div className="mb-3">
                        <h4 className="font-semibold text-slate-800 break-words line-clamp-1" title={doc.name}>
                          {doc.name}
                        </h4>
                      </div>
                      
                      <textarea
                        placeholder="Enter professional remarks here..."
                        value={doc.remarks || ''}
                        onChange={(e) => handleRemarkChange(index, e.target.value)}
                        rows={3}
                        className="w-full p-3 text-sm text-slate-700 bg-slate-50 border border-slate-300 rounded-md outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-y min-h-[100px]"
                      />
                    </div>
                  ))}
                </div>
              )}
              
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0 flex justify-end gap-3 z-10">
          <CustomButton
            variant="secondary"
            text="Cancel"
            className="bg-white border-slate-300 hover:bg-slate-50 text-slate-700"
            click={() => {
              setSignAllModalOpen({
                open: false,
                withRemarks: false,
                listOfDocuments: [],
              });
            }}
          />
          <CustomButton
            variant="primary"
            text="Confirm & Approve"
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
            click={async () => {
              await handleSignAllDocuments();
              setSignAllModalOpen({
                open: false,
                withRemarks: false,
                listOfDocuments: [],
              });
            }}
          />
        </div>
      </CustomModal>

      <RemarksModal
        open={remarksModalOpen.open === 'reject'}
        title="Reject Process"
        onClose={() => setRemarksModalOpen({ id: null, open: false })}
        loading={actionsLoading}
        onSubmit={(remarks) => handleRejectDocument(remarks)}
        remarksOptional={false}
      />

      <DeleteConfirmationModal
        isOpen={openModal.modal == 'delete-confirmation'}
        onClose={() => setOpenModal('')}
        onConfirm={() =>
          DeleteDocument({
            documentId: openModal.documentId,
            processId: process?.processId,
          })
        }
        isLoading={actionsLoading}
        deactive={false}
        documentName={openModal.documentName}
      />
    </div>
  );
};

export default ViewProcess;