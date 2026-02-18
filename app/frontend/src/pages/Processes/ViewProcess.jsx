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

  // Email thread states - MODIFIED
  const [showEmailThreadModal, setShowEmailThreadModal] = useState(false);
  const [autoOpenProcessed, setAutoOpenProcessed] = useState(false);

  const [selectedEmailThread, setSelectedEmailThread] = useState(null);
  const [expandedEmailThreads, setExpandedEmailThreads] = useState({});
  const threadExample = {
    id: 'thread_12345',
    threadText: 'Discussion regarding project timeline and deliverables.',
    extractedAt: '2026-01-23T10:15:30.000Z',
    createdBy: {
      id: 'user_001',
      username: 'john_doe',
      name: 'John Doe',
      email: 'john.doe@example.com',
    },
    metadata: {
      priority: 'high',
      source: 'gmail',
      labels: ['project', 'timeline'],
    },
    emails: [
      {
        id: 'email_1001',
        subject: 'Project Timeline Update',
        from: 'manager@example.com',
        to: ['john.doe@example.com'],
        cc: ['team@example.com'],
        bcc: [],
        date: '2026-01-20T08:30:00.000Z',
        bodyText: 'Please find the updated project timeline attached.',
        bodyHtml:
          '<p>Please find the <strong>updated project timeline</strong> attached.</p>',
        attachments: [
          {
            filename: 'timeline.pdf',
            mimeType: 'application/pdf',
            size: 245760,
          },
        ],
        messageId: '<msg-1001@example.com>',
        inReplyTo: null,
        references: [],
      },
      {
        id: 'email_1002',
        subject: 'Re: Project Timeline Update',
        from: 'john.doe@example.com',
        to: ['manager@example.com'],
        cc: [],
        bcc: [],
        date: '2026-01-21T11:45:00.000Z',
        bodyText: 'Thanks for the update. I have reviewed the timeline.',
        bodyHtml: '<p>Thanks for the update. I have reviewed the timeline.</p>',
        attachments: [],
        messageId: '<msg-1002@example.com>',
        inReplyTo: '<msg-1001@example.com>',
        references: ['<msg-1001@example.com>'],
      },
    ],
  };

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
        // emailThreads: [threadExample] || [],
      });
      // Check edit permissions for each document
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
      // filter only  active and pdf map details processStepInstanceId,documentId,processId,name, remarks
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

    // Step 1: Normalize data
    documentVersioning.forEach((group) => {
      if (group.chains) {
        // New structure with chains
        group.chains.forEach((chain) => {
          const versions = [...chain.versions].sort(
            (a, b) => a.reopenCycle - b.reopenCycle,
          );
          versions.forEach((v) => allReopenCycles.add(v.reopenCycle));
          const hasOriginal = versions.some((v) => v.reopenCycle === 0);
          if (hasOriginal) {
            lineageMap.set(chain.latestDocumentId, versions);
          } else {
            // ✅ NEW DOCUMENT (no reopenCycle 0)
            newDocuments.push(versions[0]);
          }
        });
      } else {
        // Old structure (direct versions)
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

    // Step 2: Build cycles
    return reopenCycles.map((cycle) => {
      const documents = [];
      // Existing lineages (original + replacements)
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

      // New documents appear only from their cycle onward
      newDocuments.forEach((doc) => {
        if (doc.reopenCycle <= cycle) {
          documents.push(doc);
        }
      });

      // SOP Issue No resolution
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
    // Extract cycles
    const cycles = extractDocumentsByReopenCycle(process);
    console.log(cycles);

    // Maximum number of documents in any cycle
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

  // In ViewProcess component, update the useEffect
  useEffect(() => {
    if (!process?.documents || autoOpenProcessed) return;

    const autoOpenDoc = searchParams.get('autoOpenDoc');

    if (autoOpenDoc) {
      console.log('Auto-opening document:', autoOpenDoc);
      setAutoOpenProcessed(true);

      // Find the document
      const documentToOpen = process.documents.find(
        (doc) => doc.id.toString() === autoOpenDoc || doc.id === autoOpenDoc,
      );

      if (documentToOpen) {
        console.log('Found document to open:', documentToOpen);
        // Use setTimeout to ensure the component is fully rendered
        setTimeout(() => {
          handleViewFile(
            documentToOpen.name,
            documentToOpen.path,
            documentToOpen.id,
            documentToOpen.type?.toLowerCase() || 'pdf',
            false,
          );
        }, 500); // Increased delay to ensure DOM is ready

        // Clean up URL without reload
        const url = new URL(window.location);
        url.searchParams.delete('autoOpenDoc');
        window.history.replaceState({}, '', url.toString());
      } else {
        console.warn('Document not found for autoOpenDoc:', autoOpenDoc);
        console.log(
          'Available documents:',
          process.documents.map((d) => ({ id: d.id, name: d.name })),
        );
      }
    }
  }, [process?.documents, searchParams, autoOpenProcessed]);

  // Also add this useEffect to reset autoOpenProcessed when process changes
  useEffect(() => {
    if (process?.documents) {
      // Reset autoOpenProcessed when process documents are loaded
      const autoOpenDoc = searchParams.get('autoOpenDoc');
      if (!autoOpenDoc) {
        setAutoOpenProcessed(false);
      }
    }
  }, [process?.documents, searchParams]);

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
          <CustomButton
            text={'Approve'}
            click={() => openModelSignAllDoec(process?.processStepInstanceId)}
            className={'min-w-[150px]'}
            // disabled={
            //   actionsLoading || isCompleted || process?.toBePicked === true
            // }
          />
          <CustomButton
            variant={'danger'}
            text={'Reject'}
            className={'min-w-[150px]'}
            click={() => setOpenModal('query')}
            disabled={actionsLoading || isCompleted || disableActions}
          />
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
          {/* <CustomButton
    variant={'primary'}
    text={'Claim'}
    className={'min-w-[150px]'}
    click={handleClaim}
    disabled={
      disableActions ||
      actionsLoading ||
      isCompleted ||
      process?.toBePicked === false
    }
  /> */}

          {/* <CustomButton
            variant={'secondary'}
            text={'Reject'}
            className={'min-w-[150px]'}
            click={() => setOpenModal('query')}
            disabled={actionsLoading || isCompleted || disableActions}
          /> */}
          <CustomButton
            variant={'secondary'}
            text={'Ask Recommendation'}
            className={'min-w-[150px]'}
            click={() => setOpenModal('recommend')}
            disabled={actionsLoading || isCompleted || disableActions}
          />
          <CustomButton
            variant={'secondary'}
            text={'Timeline'}
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
      {/* Email Threads Section - IMPROVED */}
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
              const totalAttachments =
                // (thread.attachmentsMapping?.length || 0) +
                threadEmails.reduce(
                  (sum, email) => sum + (email.attachments?.length || 0),
                  0,
                );

              // Extract participants from all emails
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
                  {/* Thread status indicator */}
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

                        {/* Thread stats */}
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

                        {/* Participants preview */}
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

                        {/* Email preview */}
                        {threadEmails.length > 0 && (
                          <div className="space-y-3">
                            {/* {!expandedEmailThreads[thread.id || index] ? (
                              <div className="bg-white border border-gray-200 rounded-lg p-4">
                                <div className="flex items-start gap-3 mb-3">
                                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                    <span className="text-xs font-semibold text-blue-600">
                                      1
                                    </span>
                                  </div>
                                  <div className="flex-1">
                                    <div className="text-sm font-medium text-gray-800 mb-1">
                                      {firstEmail?.from?.split('<')[0]?.trim()}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {firstEmail?.subject?.substring(0, 60)}
                                      {firstEmail?.subject?.length > 60
                                        ? '...'
                                        : ''}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-start gap-3">
                                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                                    <span className="text-xs font-semibold text-green-600">
                                      {totalEmails}
                                    </span>
                                  </div>
                                  <div className="flex-1">
                                    <div className="text-sm font-medium text-gray-800 mb-1">
                                      {latestEmail?.from?.split('<')[0]?.trim()}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      Latest:{' '}
                                      {latestEmail?.subject?.substring(0, 60)}
                                      {latestEmail?.subject?.length > 60
                                        ? '...'
                                        : ''}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {threadEmails.slice(0, 3).map((email, idx) => (
                                  <div
                                    key={idx}
                                    className="bg-white border border-gray-200 rounded-lg p-3"
                                  >
                                    <div className="flex justify-between items-start mb-2">
                                      <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                                          <span className="text-xs font-semibold text-blue-600">
                                            {idx + 1}
                                          </span>
                                        </div>
                                        <div className="text-sm font-medium text-gray-800 truncate">
                                          {email.from?.split('<')[0]?.trim()}
                                        </div>
                                      </div>
                                      <div className="text-xs text-gray-500">
                                        {new Date(
                                          email.date,
                                        ).toLocaleDateString()}
                                      </div>
                                    </div>
                                    <div className="text-sm text-gray-600 line-clamp-2">
                                      {email.bodyText?.substring(0, 120)}
                                      {email.bodyText?.length > 120
                                        ? '...'
                                        : ''}
                                    </div>
                                  </div>
                                ))}
                                {threadEmails.length > 3 && (
                                  <div className="text-center py-2">
                                    <span className="text-sm text-gray-500">
                                      + {threadEmails.length - 3} more messages
                                    </span>
                                  </div>
                                )}
                              </div>
                            )} */}

                            <div className="flex items-center justify-between mt-4">
                              {/* <button
                                type="button"
                                onClick={() =>
                                  toggleEmailThreadExpansion(thread.id || index)
                                }
                                className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"
                              >
                                {expandedEmailThreads[thread.id || index] ? (
                                  <>
                                    <IconChevronUp size={16} />
                                    Show Less
                                  </>
                                ) : (
                                  <>
                                    <IconChevronDown size={16} />
                                    Show Conversation Preview
                                  </>
                                )}
                              </button> */}
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

                      {/* Extracted documents preview */}
                      {/* {thread.attachmentsMapping &&
                        thread.attachmentsMapping.length > 0 && (
                          <div className="mt-4 pt-4 border-t">
                            <div className="flex items-center gap-2 mb-2">
                              <IconPaperclip
                                size={16}
                                className="text-green-600"
                              />
                              <span className="text-sm font-medium text-gray-700">
                                Extracted Documents (
                                {thread.attachmentsMapping.length})
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {thread.attachmentsMapping
                                .slice(0, 3)
                                .map((att, idx) => (
                                  <span
                                    key={idx}
                                    className="px-3 py-1.5 bg-green-50 text-green-800 border border-green-200 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors truncate max-w-[150px]"
                                    title={`Document: ${att.originalFilename}`}
                                  >
                                    {att.originalFilename}
                                  </span>
                                ))}
                              {thread.attachmentsMapping.length > 3 && (
                                <span className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs">
                                  +{thread.attachmentsMapping.length - 3} more
                                </span>
                              )}
                            </div>
                          </div>
                        )} */}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
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
                    {/* <CustomButton
                      variant="success"
                      className="px-2"
                      click={() =>
                        setCustomSignModal({
                          open: true,
                          id: doc.id,
                          remarks: '',
                        })
                      }
                      disabled={
                        actionsLoading ||
                        doc?.signedBy?.find(
                          (entry) => entry?.signedBy == username,
                        ) ||
                        doc?.type?.toUpperCase() !== 'PDF' ||
                        doc?.rejectionDetails ||
                        doc?.preApproved ||
                        disableActions
                      }
                      title="Sign Document"
                      text={<IconCheck size={18} className="text-white" />}
                    />
                    <CustomButton
                      variant="danger"
                      className="px-2"
                      click={() =>
                        setRemarksModalOpen({ id: doc.id, open: 'reject' })
                      }
                      disabled={
                        actionsLoading ||
                        isCompleted ||
                        doc.rejectionDetails ||
                        doc?.preApproved ||
                        disableActions
                      }
                      title="Reject Document"
                      text={<IconX size={18} className="text-white" />}
                    /> */}
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
      {process?.queryDetails?.length > 0 && (
        <>
          <div className="flex items-center mt-12 mb-2">
            <div className="flex-grow border-t border-slate-400"></div>
            <span className="mx-4 text-sm text-gray-500 uppercase tracking-wide font-medium">
              Queries ({process.queryDetails.length})
            </span>
            <div className="flex-grow border-t border-slate-400"></div>
          </div>
          <div className="mt-2">
            <div className="space-y-4">
              {process?.queryDetails?.map((query, index) => (
                <CustomCard key={index}>
                  <div className="space-y-1">
                    {query.stepName && (
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">Step Name:</span>{' '}
                        {query.stepName}
                      </p>
                    )}
                    {query.stepNumber && (
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">Step Number:</span>{' '}
                        {query.stepNumber}
                      </p>
                    )}
                    {query.status && (
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">Status:</span>{' '}
                        {query.status}
                      </p>
                    )}
                    {query.taskType && (
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">Task Type:</span>{' '}
                        {query.taskType}
                      </p>
                    )}
                    {query.queryText && (
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">Query Text:</span>{' '}
                        {query.queryText}
                      </p>
                    )}
                    {query.answerText && (
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">Answer Text:</span>{' '}
                        {query.answerText}
                      </p>
                    )}
                    {query.createdAt && (
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">Created At:</span>{' '}
                        {new Date(query.createdAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <CustomButton
                      disabled={
                        actionsLoading ||
                        isCompleted ||
                        disableActions ||
                        query.answerText
                      }
                      text={query.answerText ? 'Already Solved' : 'Solve Query'}
                      variant="primary"
                      click={() => handleSolveQuery(query)}
                    />
                  </div>
                </CustomCard>
              ))}
            </div>
          </div>
        </>
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

      {/* Custom Sign Modal */}
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

      {/* Email Thread Modal - FIXED: Only renders when showEmailThreadModal is true */}
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
        className={'max-h-[95vh] overflow-auto max-w-lg w-full'}
      >
        <div>
          <h2 className="text-lg font-semibold mb-4">Approve All Documents</h2>
          <p className="mb-4">
            Are you sure you want to approve all documents?
          </p>
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
              <table className="w-full border">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border px-3 py-2 text-left">
                      Document Name
                    </th>
                    <th className="border px-3 py-2 text-left">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {signAllModalOpen.listOfDocuments.map((doc, index) => (
                    <tr key={index}>
                      <td className="border px-3 py-2">{doc.name}</td>
                      <td className="border px-3 py-2">
                        <input
                          type="text"
                          value={doc.remarks || ''}
                          onChange={(e) => {
                            const updatedDocuments = [
                              ...signAllModalOpen.listOfDocuments,
                            ];
                            updatedDocuments[index].remarks = e.target.value;
                            setSignAllModalOpen({
                              ...signAllModalOpen,
                              listOfDocuments: updatedDocuments,
                            });
                          }}
                          className="w-full p-1 border rounded"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
