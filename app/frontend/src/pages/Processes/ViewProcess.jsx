import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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

  // Email thread states
  const [showEmailThreadModal, setShowEmailThreadModal] = useState(false);
  const [autoOpenProcessed, setAutoOpenProcessed] = useState(false);

  const [selectedEmailThread, setSelectedEmailThread] = useState(null);
  const [expandedEmailThreads, setExpandedEmailThreads] = useState({});

  const [customSignModal, setCustomSignModal] = useState({
    open: false,
    id: null,
    remarks: '',
  });

  const disableActions = process?.currentStepType != 'APPROVAL';

  const processDetails = [
    { label: 'Process ID', value: process?.processId },
    { label: 'Process Name', value: process?.processName || 'N/A' },
    { label: 'Process Version', value: process?.issueNo || 'N/A' },
    { label: 'Description', value: process?.description || 'N/A' },
    { label: 'Initiator Name', value: process?.initiatorName || 'Unknown' },
    {
      label: 'Status',
      value: (
        <span
          className={`px-3 py-1 rounded-full max-w-[200px] text-white text-sm font-semibold block text-center mt-1 ${
            process?.status === 'PENDING' ? 'bg-yellow-500' : 'bg-green-500'
          }`}
        >
          {process?.status}
        </span>
      ),
    },
    {
      label: 'Created At',
      value: new Date(process?.createdAt).toLocaleString(),
    },
    {
      label: 'Updated At',
      value: process?.updatedAt
        ? new Date(process?.updatedAt).toLocaleString()
        : 'N/A',
    },
    {
      label: 'Completed At',
      value: process?.completedAt
        ? new Date(process?.completedAt).toLocaleString()
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
    <div>
      <span className="block text-md text-black font-medium">{label}</span>
      <span className="text-lg font-normal text-gray-900">{value}</span>
    </div>
  );

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
        .filter((doc) => !doc.rejectionDetails && doc.type === 'pdf')
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
        documents,
      };
    });
  }

  const DocumentsCycle = (process) => {
    const cycles = extractDocumentsByReopenCycle(process);
    const maxDocs = Math.max(...cycles?.map((cycle) => cycle.documents.length));

    if (cycles?.length === 0) return null;

    return (
      <CustomCard className={'mt-2'}>
        <h2 className="text-xl font-semibold mb-4">
          Documents by Reopen Cycle
        </h2>
        <div className="overflow-auto">
          <table className="min-w-full border border-gray-300">
            <thead className="bg-gray-100">
              <tr>
                <th className="py-2 px-4 border">System Process Version</th>
                {Array.from({ length: maxDocs }).map((_, idx) => (
                  <th key={idx} className="py-2 px-4 border">
                    Document {idx + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cycles.map((cycle, index) => {
                const isLastRow = index === cycles.length - 1;
                return (
                  <tr
                    key={cycle.reopenCycle}
                    className={isLastRow ? 'bg-green-100 font-semibold' : ''}
                  >
                    <td className="py-2 px-4 border font-medium">
                      {cycle.reopenCycle}
                    </td>
                    {Array.from({ length: maxDocs }).map((_, idx) => {
                      const doc = cycle.documents[idx];
                      return (
                        <td key={idx} className="py-2 px-4 border text-wrap">
                          {doc ? (
                            <div className="flex items-center space-x-2 mr-4">
                              <img
                                width={28}
                                src={
                                  ImageConfig[doc.type] ||
                                  ImageConfig['default']
                                }
                                alt={doc.type}
                              />
                              <div className="flex flex-col">
                                <span
                                  title={doc.name}
                                  className={`truncate ${
                                    doc.active
                                      ? 'font-semibold'
                                      : 'text-gray-400'
                                  }`}
                                >
                                  {doc.name}
                                </span>
                                <span className="text-sm text-blue-600 font-medium">
                                  Version No: {doc?.issueNo || '--'}
                                </span>
                              </div>
                              <CustomButton
                                className="px-2"
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
                                text={
                                  <IconEye size={18} className="text-white" />
                                }
                              />
                              <CustomButton
                                variant="info"
                                className="px-2"
                                click={() => setDocumentModalOpen(doc)}
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
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
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
    handleClose();
  };

  if (loading) return <ComponentLoader />;
  if (error)
    return (
      <CustomCard>
        <p className="text-lg font-semibold">Error: {error}</p>
        <div className="mt-4 flex space-x-4">
          <CustomButton
            click={() => navigate('/processes/work')}
            text={'Go Back'}
          />
        </div>
      </CustomCard>
    );
  const isInitiator =
    process?.initiatorName === sessionStorage.getItem('username');

  if (!process)
    return (
      <div className="text-center text-gray-500 py-10">
        No process data available
      </div>
    );

  return (
    <div className="mx-auto">
      {actionsLoading && <TopLoader />}
      <CustomCard>
        <div className="flex justify-end flex-row gap-2 flex-wrap">
          {!isInitiator && (
            <CustomButton
              text={'Approve'}
              click={() => openModelSignAllDoec(process?.processStepInstanceId)}
              className={'min-w-[150px]'}
            />
          )}
          {!isInitiator && (
            <CustomButton
              variant={'danger'}
              text={'Reject'}
              className={'min-w-[150px]'}
              click={() => setOpenModal('query')}
              disabled={actionsLoading || isCompleted || disableActions}
            />
          )}
          {isCompleted && !disableActions && (
            <CustomButton
              variant={'primary'}
              text={'Re-Open'}
              className={'min-w-[150px]'}
              click={() => setOpenModal('re-open')}
              disabled={actionsLoading}
            />
          )}
          <CustomButton
            variant={'primary'}
            text={'Upload Document'}
            className={'min-w-[150px] hidden'}
            click={() => setOpenModal('document-upload')}
            disabled={actionsLoading || !isCompleted || disableActions}
          />
          <CustomButton
            variant={'secondary'}
            text={'Ask Recommendation'}
            className={'min-w-[150px]'}
            click={() => setOpenModal('recommend')}
            disabled={actionsLoading || isCompleted || disableActions}
          />
          <CustomButton
            variant={'secondary'}
            text={'Activity Logs'}
            click={() => navigate(`/timeline/${process?.processId}`)}
            className={'min-w-[150px]'}
            disabled={actionsLoading}
          />
        </div>
        <hr className="text-slate-200 my-2" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {processDetails.map((detail, index) => (
            <div
              key={index}
              className="p-4 border border-slate-300 bg-zinc-50 rounded-lg shadow-sm"
            >
              <p className="font-semibold text-lg">{detail.label}</p>
              <p>{detail.value}</p>
            </div>
          ))}
        </div>
      </CustomCard>

      {/* Email Threads Section */}
      {process?.emailThreads?.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center mb-6">
            <div className="flex-grow border-t border-blue-300"></div>
            <span className="mx-4 text-sm font-semibold text-blue-700 uppercase tracking-wide flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-full">
              <IconMail size={16} className="text-blue-600" />
              Email Conversations ({process.emailThreads.length})
            </span>
            <div className="flex-grow border-t border-blue-300"></div>
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
                  className="group relative bg-gradient-to-br from-white to-blue-50 border border-blue-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-lg transition-all duration-300"
                >
                  <div className="absolute top-4 right-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        totalAttachments > 0
                          ? 'bg-green-100 text-green-800 border border-green-200'
                          : 'bg-blue-100 text-blue-800 border border-blue-200'
                      }`}
                    >
                      {totalAttachments > 0
                        ? `${totalAttachments} files`
                        : 'No files'}
                    </span>
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
                          {firstEmail?.subject || 'Email Conversation'}
                        </h3>

                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-3">
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                            <span className="font-medium">
                              {totalEmails} messages
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <IconUser size={14} />
                            <span className="font-medium">
                              {participants.size} participants
                            </span>
                          </div>
                          {thread.extractedAt && (
                            <div className="flex items-center gap-1">
                              <IconClock size={14} />
                              <span>{formatDate(thread.extractedAt)}</span>
                            </div>
                          )}
                        </div>

                        {participantsList.length > 0 && (
                          <div className="mb-4">
                            <div className="flex items-center gap-2 text-sm text-gray-700 mb-2">
                              <IconUsers size={14} />
                              <span className="font-medium">Participants:</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {participantsList.map((participant, idx) => (
                                <span
                                  key={idx}
                                  className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-blue-50 hover:border-blue-200 transition-colors"
                                >
                                  {participant}
                                </span>
                              ))}
                              {hasMoreParticipants && (
                                <span className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm">
                                  +{participants.size - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {threadEmails.length > 0 && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between mt-4">
                              <div></div>
                              <div className="flex items-center gap-2">
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

      {process?.queryDetails?.some((query) => !query.answerText) && (
        <div className="flex items-center justify-center m-4">
          <span className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-300 rounded-lg">
            <IconAlertSquareRoundedFilled size={18} className="text-red-600" />
            <span className="text-sm font-medium text-red-700">
              Query raised on this process — please review and address it.
            </span>
          </span>
        </div>
      )}

      {/* Active Documents Section */}
      {process?.documents?.length > 0 && (
        <>
          <div className="flex items-center mt-12 mb-2">
            <div className="flex-grow border-t border-green-600"></div>
            <span className="flex items-center gap-2 mx-4 text-sm text-green-700 uppercase tracking-wide font-semibold">
              <IconFileText size={16} className="text-green-700" />
              Active Documents ({process.documents.length})
            </span>
            <div className="flex-grow border-t border-green-600"></div>
          </div>

          <CustomButton
            disabled={selectedDocs.length === 0}
            className="ml-auto mb-4 block"
            text={`View All Selected (${selectedDocs.length})`}
            click={handleViewAllSelectedFiles}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
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
                  className="relative flex flex-col justify-between"
                >
                  <div className="absolute top-2 right-2">
                    {doc.rejectionDetails ? (
                      <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full shadow-sm">
                        Rejected
                      </span>
                    ) : (
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full shadow-sm">
                        Active
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex items-start gap-3 w-full">
                      <input
                        type="checkbox"
                        className="mt-1 shrink-0"
                        checked={isSelected}
                        disabled={doc.type !== 'pdf'}
                        onChange={toggleSelect}
                      />
                      <div className="w-10 h-10 shrink-0 rounded-full bg-gray-100 border flex items-center justify-center">
                        <img
                          width={28}
                          src={ImageConfig[extension] || ImageConfig['default']}
                          alt="icon"
                        />
                      </div>
                      <div className="flex flex-col min-w-0 mr-9">
                        <p className="font-semibold text-gray-900 break-words">
                          {doc.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          Type: {extension}
                        </p>
                        {doc.issueNo && (
                          <p className="text-xs text-blue-600">
                            Version: {doc.issueNo}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <CustomButton
                      className="px-2"
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
                      className="px-2"
                      click={() => setDocumentModalOpen(doc)}
                      disabled={actionsLoading}
                      title="Details"
                      text={
                        <IconAlignBoxCenterMiddle
                          size={18}
                          className="text-white"
                        />
                      }
                    />
                    <CustomButton
                      variant="danger"
                      className="px-2"
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
                      className="px-2"
                      click={() => handleDownload(doc.path, doc.name)}
                      title="Download Document"
                      text={<IconDownload size={18} className="text-white" />}
                    />
                  </div>
                </CustomCard>
              );
            })}
          </div>
        </>
      )}

      {process && DocumentsCycle(process)}

      {/* Superseded Documents Section */}
      {process?.sededDocuments?.length > 0 && (
        <div className="mt-12">
          <div className="flex items-center mb-4">
            <div className="flex-grow border-t border-rose-400"></div>
            <span className="mx-4 text-sm text-rose-600 uppercase tracking-wide font-semibold">
              Superseded Documents ({process.sededDocuments.length})
            </span>
            <div className="flex-grow border-t border-rose-400"></div>
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
                  className="relative border !border-rose-300 !bg-rose-50 shadow-sm p-4"
                >
                  <div className="absolute bottom-2 right-2">
                    <span className="text-xs border bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full">
                      Superseded
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-white border flex items-center justify-center text-rose-700 text-xl">
                        <img
                          width={30}
                          src={ImageConfig[ext] || ImageConfig['default']}
                          alt="icon"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 break-words">
                          {docGroup.documentWhichSuperseded.name}
                        </p>
                        <p className="text-sm text-gray-500 truncate">
                          {docGroup.documentWhichSuperseded.path}
                        </p>
                        {docGroup.documentWhichSuperseded.issueNo && (
                          <p className="text-xs text-rose-600">
                            Version: {docGroup.documentWhichSuperseded.issueNo}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <CustomButton
                        className="px-2"
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
                        className="px-2"
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
                    <div className="mt-4 pl-5 border-l-2 border-dashed border-rose-300">
                      <p className="text-sm font-medium text-gray-600 mb-2">
                        Version History ({docGroup.versions.length} versions):
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {docGroup.versions.map((ver) => {
                          const prevExt = ver.name
                            ?.split('.')
                            .pop()
                            ?.toLowerCase();
                          return (
                            <CustomCard
                              key={ver.id}
                              className="flex flex-col justify-between"
                            >
                              <div className="flex gap-3 mb-3">
                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                                  <img
                                    width={24}
                                    src={
                                      ImageConfig[prevExt] ||
                                      ImageConfig['default']
                                    }
                                    alt="icon"
                                  />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-800 break-words">
                                    {ver.name}
                                  </p>
                                  <p className="text-xs text-gray-500 truncate max-w-full">
                                    {ver.path}
                                  </p>
                                  {ver.issueNo && (
                                    <p className="text-xs text-blue-600">
                                      Version: {ver.issueNo}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2 justify-end mt-auto">
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
                            </CustomCard>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CustomCard>
              );
            })}
          </div>
        </div>
      )}

      {/* Queries Section */}
      {/* Queries Section */}
      {/* Queries Section */}
      {process?.queryDetails?.length > 0 && (
        <div id="queries-section" className="mt-12">
          <div className="flex items-center mb-6">
            <div className="flex-grow border-t border-slate-300"></div>
            <span className="mx-4 text-sm text-gray-600 uppercase tracking-wider font-semibold flex items-center gap-2">
              <IconQuestionMark size={16} />
              Queries / Clarifications ({process.queryDetails.length})
            </span>
            <div className="flex-grow border-t border-slate-300"></div>
          </div>

          <div className="space-y-6">
            {process?.queryDetails?.map((query, index) => {
              const isResolved = !!query.answerText;
              const assigneeName =
                query.assigneeDetails?.assignedAssigneeName || 'Unknown User';
              const assigneeStep =
                query.assigneeDetails?.assignedStepName || 'Unknown Step';

              // Helper to safely get document name when the nested relation is null
              const getDocumentName = (id, fallbackObj) => {
                if (fallbackObj?.name) return fallbackObj.name;
                const found = process.documents?.find((d) => d.id === id);
                return found?.name || `Document ID: ${id}`;
              };

              return (
                <CustomCard
                  key={index}
                  className={`border-l-4 overflow-hidden shadow-sm ${
                    isResolved ? 'border-l-emerald-500' : 'border-l-yellow-500'
                  }`}
                >
                  {/* --- Header Section --- */}
                  <div className="flex justify-between items-start mb-5 border-b pb-4 border-slate-100">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-semibold text-lg text-slate-800">
                          {query.stepName
                            ? `Query at ${query.stepName}`
                            : 'Process Query'}
                        </h3>
                        <span
                          className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            isResolved
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                              : 'bg-yellow-50 text-yellow-700 border-yellow-300'
                          }`}
                        >
                          {isResolved ? 'Resolved' : 'Pending Resolution'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500 mt-2">
                        <div className="flex items-center gap-1.5">
                          <IconAt size={14} className="text-slate-400" />
                          <span>
                            <strong className="text-slate-700 font-medium">
                              Raised by:
                            </strong>{' '}
                            {query.initiatorName || 'Process Reviewer'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <IconUser size={14} className="text-blue-400" />
                          <span>
                            <strong className="text-slate-700 font-medium">
                              Assigned to:
                            </strong>{' '}
                            {assigneeName}{' '}
                            <span className="text-slate-400">
                              ({assigneeStep})
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <IconClock size={14} className="text-slate-400" />
                          <span>
                            <strong className="text-slate-700 font-medium">
                              Created:
                            </strong>{' '}
                            {new Date(query.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* --- Query Description (What was asked) --- */}
                  <div className="bg-slate-50/50 p-4 rounded-md border border-slate-200 mb-5">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <IconAlertSquareRoundedFilled
                        size={14}
                        className="text-yellow-500"
                      />
                      Query Description
                    </p>
                    <p className="text-slate-800 whitespace-pre-wrap text-sm leading-relaxed">
                      {query.queryText || (
                        <span className="text-slate-400 italic">
                          No description provided.
                        </span>
                      )}
                    </p>
                  </div>

                  {/* --- Document Specific Feedback (What was asked about specific docs) --- */}
                  {query.documentSummaries?.length > 0 && (
                    <div className="mb-5">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Document Specific Feedback
                      </p>
                      <div className="overflow-x-auto rounded-md border border-slate-200">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
                            <tr>
                              <th className="p-3 font-semibold w-1/3">
                                Document
                              </th>
                              <th className="p-3 font-semibold">Feedback</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {query.documentSummaries.map((ds) => (
                              <tr
                                key={ds.documentId}
                                className="hover:bg-slate-50 transition-colors"
                              >
                                <td className="p-3 font-medium text-slate-800 align-top break-words">
                                  {getDocumentName(
                                    ds.documentId,
                                    ds.documentDetails,
                                  )}
                                </td>
                                <td className="p-3 text-slate-600 align-top whitespace-pre-wrap">
                                  {ds.feedbackText}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* --- Resolution Section (Shown ONLY if resolved) --- */}
                  {isResolved && (
                    <div className="bg-emerald-50/60 p-5 rounded-lg border border-emerald-200 mt-6 relative shadow-sm">
                      {/* Floating Status Badge */}
                      <div className="absolute -top-3 left-5 bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded shadow-sm flex items-center gap-1.5">
                        <IconCheck size={14} stroke={3} /> Query Resolved
                      </div>

                      <div className="pt-2">
                        {/* Stylish Label for Resolution Text */}
                        <div className="flex items-center gap-3 mb-3">
                          <div className="bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5 border border-emerald-200 shadow-sm">
                            <IconMessageCircle
                              size={16}
                              className="text-emerald-600"
                            />
                            Resolution Provided
                          </div>
                          <div className="flex-grow border-t border-dashed border-emerald-300"></div>
                        </div>

                        {/* Resolution Text Box */}
                        <div className="bg-white/80 p-4 rounded-md border border-emerald-100 shadow-sm">
                          <p className="text-emerald-950 whitespace-pre-wrap text-sm leading-relaxed">
                            {query.answerText}
                          </p>
                        </div>

                        {query.answeredAt && (
                          <div className="flex justify-end mt-2">
                            <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                              <IconClock size={12} />
                              Resolved on{' '}
                              {new Date(query.answeredAt).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Document Changes made DURING resolution */}
                      {query.documentChanges?.length > 0 && (
                        <div className="mt-5 border-t border-emerald-200/60 pt-4">
                          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <IconPaperclip size={14} />
                            Documents Updated in Resolution
                          </p>
                          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {query.documentChanges.map((dc, idx) => {
                              const docName = getDocumentName(
                                dc.documentId,
                                dc.document,
                              );
                              const replacedDocName = dc.replacedDocument?.name;

                              return (
                                <li
                                  key={idx}
                                  className="text-sm bg-white border border-emerald-200/80 p-3 rounded-md flex items-start gap-3 shadow-sm"
                                >
                                  <IconFileText
                                    size={20}
                                    className={`${dc.isReplacement ? 'text-orange-500' : 'text-emerald-500'} mt-0.5 shrink-0`}
                                  />
                                  <div className="flex flex-col">
                                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                                      {dc.isReplacement
                                        ? 'Replaced Document'
                                        : 'New Document Uploaded'}
                                    </span>
                                    <span className="text-slate-800 font-medium break-words">
                                      {docName}
                                    </span>
                                    {dc.isReplacement && replacedDocName && (
                                      <span className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                        Replaced:{' '}
                                        <span className="line-through">
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

                  {/* --- Targeted Documents (Shown ONLY if pending and attached to the query) --- */}
                  {!isResolved && query.documentChanges?.length > 0 && (
                    <div className="mb-5">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <IconPaperclip size={14} className="text-blue-500" />
                        Targeted Documents
                      </p>
                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {query.documentChanges.map((dc, idx) => {
                          const docName = getDocumentName(
                            dc.documentId,
                            dc.document,
                          );
                          const replacedDocName = dc.replacedDocument?.name;

                          return (
                            <li
                              key={idx}
                              className="text-sm bg-white border border-slate-200 p-3 rounded-md flex items-start gap-3 shadow-sm"
                            >
                              <IconFileText
                                size={20}
                                className={`${dc.isReplacement ? 'text-orange-500' : 'text-blue-500'} mt-0.5 shrink-0`}
                              />
                              <div className="flex flex-col">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                                  {dc.isReplacement
                                    ? 'Replacement Required'
                                    : 'Action Required'}
                                </span>
                                <span className="text-slate-800 font-medium break-words">
                                  {docName}
                                </span>
                                {dc.isReplacement && replacedDocName && (
                                  <span className="text-xs text-slate-500 mt-1">
                                    To Replace: {replacedDocName}
                                  </span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {/* --- Action Footer --- */}
                  {!isResolved && (
                    <div className="mt-4 flex justify-end pt-4 border-t border-slate-100">
                      <CustomButton
                        disabled={
                          actionsLoading || isCompleted || disableActions
                        }
                        text="Solve Query"
                        variant="primary"
                        click={() => handleSolveQuery(query)}
                      />
                    </div>
                  )}
                </CustomCard>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommendations Section */}
      {process?.recommendationDetails?.length > 0 && (
        <>
          <div className="flex items-center mt-12 mb-2">
            <div className="flex-grow border-t border-slate-400"></div>
            <span className="mx-4 text-sm text-gray-500 uppercase tracking-wide font-medium">
              Recommendations ({process.recommendationDetails.length})
            </span>
            <div className="flex-grow border-t border-slate-400"></div>
          </div>
          <div className="mt-2 space-y-4">
            {process?.recommendationDetails?.map((rec, index) => (
              <CustomCard key={rec.recommendationId || index}>
                <div className="space-y-1 text-sm text-gray-700">
                  <p>
                    <span className="font-semibold">Step:</span> {rec.stepName}{' '}
                    (#{rec.stepNumber})
                  </p>
                  <p>
                    <span className="font-semibold">Status:</span> {rec.status}
                  </p>
                  <p>
                    <span className="font-semibold">Initiator:</span>{' '}
                    {rec.initiatorName}
                  </p>
                  <p>
                    <span className="font-semibold">Recommender:</span>{' '}
                    {rec.recommenderName}
                  </p>
                  <p>
                    <span className="font-semibold">Recommendation:</span>{' '}
                    {rec.recommendationText}
                  </p>
                  {rec.responseText && (
                    <p>
                      <span className="font-semibold">Response:</span>{' '}
                      {rec.responseText}
                    </p>
                  )}
                  <p>
                    <span className="font-semibold">Created At:</span>{' '}
                    {new Date(rec.createdAt).toLocaleString()}
                  </p>
                  {rec.respondedAt && (
                    <p>
                      <span className="font-semibold">Responded At:</span>{' '}
                      {new Date(rec.respondedAt).toLocaleString()}
                    </p>
                  )}
                  {rec.documentDetails?.length > 0 && (
                    <div className="mt-4">
                      <p className="font-semibold mb-2">Attached Documents:</p>
                      <div className="overflow-x-auto">
                        <table className="min-w-full border text-sm">
                          <thead className="bg-slate-100">
                            <tr>
                              <th className="border px-3 py-2 text-left">
                                Document Name
                              </th>
                              <th className="border px-3 py-2 text-left">
                                Query Text
                              </th>
                              <th className="border px-3 py-2 text-left">
                                Answer Text
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {rec.documentDetails.map((doc) => (
                              <tr key={doc.documentId}>
                                <td className="border px-3 py-2">
                                  {doc.documentName}
                                </td>
                                <td className="border px-3 py-2">
                                  {doc.queryText || '-'}
                                </td>
                                <td className="border px-3 py-2">
                                  {doc.answerText || '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </CustomCard>
            ))}
          </div>
        </>
      )}

      {/* All Modals */}
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
          className={'max-h-[99vh] overflow-auto'}
        >
          <div className="space-y-8 text-sm text-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 border-b pb-2">
              Document Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6">
              <DetailItem
                label="Name"
                value={documentModalOpen?.name || '--'}
              />
              <DetailItem
                label="Description"
                value={documentModalOpen?.description || '--'}
              />
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
                label="Tags"
                value={documentModalOpen?.tags?.flat()?.join(', ') || '--'}
              />
              <DetailItem
                label="Approval Count"
                value={documentModalOpen?.approvalCount || '--'}
              />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-semibold text-gray-900 border-b pb-1">
                Signed By
              </h3>
              {documentModalOpen?.signedBy?.length > 0 ? (
                <ul className="list-disc list-inside space-y-2 pl-2 text-gray-700">
                  {documentModalOpen?.signedBy?.map((entry, idx) => (
                    <li key={idx}>
                      <div>
                        <span className="font-medium">{entry.signedBy}</span>
                        <span className="text-gray-600">
                          ({new Date(entry.signedAt).toLocaleString()})
                        </span>
                      </div>
                      {entry.remarks && (
                        <div className="ml-4 italic text-gray-600">
                          Remarks: {entry.remarks}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-gray-500">—</span>
              )}
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-semibold text-gray-900 border-b pb-1">
                Rejection Details
              </h3>
              {documentModalOpen?.rejectionDetails ? (
                <div className="space-y-1 pl-1">
                  <p>
                    <span className="font-semibold">Rejected By:</span>{' '}
                    {documentModalOpen?.rejectionDetails.rejectedBy}
                  </p>
                  <p>
                    <span className="font-semibold">Reason:</span>{' '}
                    {documentModalOpen?.rejectionDetails.rejectionReason}
                  </p>
                  <p>
                    <span className="font-semibold">Rejected At:</span>{' '}
                    {new Date(
                      documentModalOpen?.rejectionDetails.rejectedAt,
                    ).toLocaleString()}
                  </p>
                </div>
              ) : (
                <span className="text-gray-500">—</span>
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
        className={'max-h-[95vh] overflow-auto max-w-lg w-full'}
      >
        <div className="p-4">
          <h2 className="text-lg font-semibold mb-4">Sign Document</h2>
          <p className="mb-4 text-gray-600">
            Remarks are optional. You can leave it blank if you don't have any
            remarks.
          </p>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
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
              className="w-full p-2 border border-gray-300 rounded-md"
              rows={3}
              placeholder="Enter optional remarks..."
            />
          </div>
          <div className="flex justify-end space-x-2">
            <CustomButton
              variant="secondary"
              text="Cancel"
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

      {/* Query Modal */}
      <CustomModal
        isOpen={openModal == 'query'}
        onClose={() => {
          setOpenModal('');
          setExistingQuery(null);
        }}
        className={'max-h-[95vh] overflow-auto max-w-lg w-full'}
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

      {/* Documents Version Wise Modal */}
      <CustomModal
        isOpen={openModal == 'version-wise'}
        onClose={() => {
          setOpenModal('');
        }}
        className={'max-h-[95vh] overflow-auto max-w-lg w-full'}
      >
        <DocumentsVersionWise
          processId={process.processId}
          close={() => setOpenModal('')}
        />
      </CustomModal>

      {/* Document Upload Modal */}
      <CustomModal
        isOpen={openModal == 'document-upload'}
        onClose={() => {
          setOpenModal('');
        }}
        className={'max-h-[95vh] overflow-auto max-w-lg w-full'}
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

      {/* Query Solve Modal */}
      <CustomModal
        isOpen={existingQuery}
        onClose={() => {
          setExistingQuery(null);
        }}
        className={'max-h-[95vh] overflow-auto max-w-lg w-full'}
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
          documents={process.documents} // <-- UPDATED LINE
        />
      </CustomModal>

      {/* Ask Recommendation Modal */}
      <CustomModal
        isOpen={openModal == 'recommend'}
        onClose={() => {
          setOpenModal('');
        }}
        className={'max-h-[95vh] overflow-auto max-w-lg w-full'}
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

      {/* Re-Open Process Modal */}
      <CustomModal
        isOpen={openModal == 're-open'}
        onClose={() => {
          setOpenModal('');
        }}
        className={'max-h-[95vh] overflow-auto max-w-lg w-full'}
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

      {/* Sign All Documents Modal */}
      <CustomModal
        isOpen={signAllModalOpen.open}
        onClose={() => {
          setSignAllModalOpen({
            open: false,
            withRemarks: false,
            listOfDocuments: [],
          });
        }}
        className={'max-h-[95vh] overflow-auto max-w-xl w-full'}
      >
        <div>
          <h2 className="text-lg font-semibold mb-4">Approve All Documents</h2>
          <p className="mb-4">
            Are you sure you want to approve all documents?
          </p>
          {signAllModalOpen.listOfDocuments.length > 0 && (
            <>
              <div className="mb-4">
                <label className="inline-flex items-center">
                  <input
                    type="checkbox"
                    name="signWithRemarks"
                    checked={signAllModalOpen.withRemarks}
                    onChange={() => {
                      setSignAllModalOpen({
                        ...signAllModalOpen,
                        withRemarks: !signAllModalOpen.withRemarks,
                      });
                    }}
                  />
                  <span className="ml-2">With Remarks</span>
                </label>
              </div>
              {signAllModalOpen.withRemarks && (
                <div className="mb-4">
                  <table className="w-full border table-fixed">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border px-3 py-2 text-left w-1/2">
                          Document Name
                        </th>
                        <th className="border px-3 py-2 text-left w-1/2">
                          Remarks
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {signAllModalOpen.listOfDocuments.map((doc, index) => (
                        <tr key={index}>
                          <td className="border px-3 py-2 w-1/2 overflow-x-auto">
                            <div className="truncate" title={doc.name}>
                              {doc.name}
                            </div>
                          </td>
                          <td className="border px-3 py-2 w-1/2">
                            <textarea
                              placeholder="Remarks...."
                              value={doc.remarks || ''}
                              onChange={(e) => {
                                const updatedDocuments = [
                                  ...signAllModalOpen.listOfDocuments,
                                ];
                                updatedDocuments[index].remarks =
                                  e.target.value;
                                setSignAllModalOpen({
                                  ...signAllModalOpen,
                                  listOfDocuments: updatedDocuments,
                                });
                              }}
                              className="w-full p-1 border rounded resize-y min-h-[60px]"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          <div className="flex justify-end space-x-2">
            <CustomButton
              variant="secondary"
              text={'Cancel'}
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
              text={'Confirm'}
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
        </div>
      </CustomModal>

      {/* Reject Modal (Remarks Required) */}
      <RemarksModal
        open={remarksModalOpen.open === 'reject'}
        title="Reject Remarks"
        onClose={() => setRemarksModalOpen({ id: null, open: false })}
        loading={actionsLoading}
        onSubmit={(remarks) => handleRejectDocument(remarks)}
        remarksOptional={false}
      />

      {/* Delete Confirmation Modal */}
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
