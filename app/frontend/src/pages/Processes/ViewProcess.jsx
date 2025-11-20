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
  SignRevoke,
  ViewDocument,
} from '../../common/Apis';
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

const ViewProcess = () => {
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [searchParams] = useSearchParams();
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
  const [openModal, setOpenModal] = useState('');
  const [recommendations, setRecommendations] = useState([]);
  const [canEdit, setCanEdit] = useState({});
  const [remarksModalOpen, setRemarksModalOpen] = useState({
    id: null,
    open: false,
  });
  const disableActions = process?.currentStepType != 'APPROVAL';
  const [deleteConfirm, setDeleteConfirm] = useState({
    open: false,
    documentId: null,
    documentName: null,
  });

  const processDetails = [
    { label: 'Process ID', value: process?.processId },
    { label: 'Process Name', value: process?.processName || 'N/A' },
    { label: 'Process SOP', value: process?.issueNo || 'N/A' },
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
      label: 'Arrived At',
      value: new Date(process?.arrivedAt).toLocaleString(),
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
      setProcess(response?.data?.process);

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

  const handleSignDocument = async (remarks) => {
    setActionsLoading(true);
    try {
      const res = await SignDocument(
        process?.processId,
        process?.processStepInstanceId,
        remarksModalOpen.id,
        remarks,
      );
      toast.success(res?.data?.message);
      setRemarksModalOpen({ id: null, open: false });
      setProcess((prev) => ({
        ...prev,
        documents: prev.documents.map((doc) =>
          doc.id === remarksModalOpen.id
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

  function extractDocumentsByReopenCycle(processData) {
    const { documentVersioning } = processData;

    const allReopenCycles = new Set();
    const documentLineage = new Map();

    const originalOrder = [];
    const originalDocumentsMap = new Map();

    // Pre-process all document versions and find original order
    documentVersioning.forEach((docGroup) => {
      const versions = docGroup.versions.sort(
        (a, b) => a.reopenCycle - b.reopenCycle,
      );

      documentLineage.set(docGroup.latestDocumentId, versions);

      const originalVersion = versions.find((v) => v.reopenCycle === 0);
      if (originalVersion) {
        originalOrder.push(originalVersion.id);
        originalDocumentsMap.set(originalVersion.id, versions);
      }

      versions.forEach((version) => {
        allReopenCycles.add(version.reopenCycle);
      });
    });

    const reopenCycles = Array.from(allReopenCycles).sort((a, b) => a - b);

    const result = reopenCycles.map((currentCycle) => {
      const cycleDocuments = [];

      originalOrder.forEach((originalDocId) => {
        const versions = originalDocumentsMap.get(originalDocId);
        if (versions) {
          let appropriateVersion = null;

          for (let i = versions.length - 1; i >= 0; i--) {
            if (versions[i].reopenCycle <= currentCycle) {
              appropriateVersion = versions[i];
              break;
            }
          }

          if (appropriateVersion) {
            cycleDocuments.push(appropriateVersion);
          }
        }
      });

      // ---------------------------
      // NEW: SOPIssueNo = version matching the reopenCycle
      // ---------------------------
      let sopIssueNo = null;

      for (const doc of cycleDocuments) {
        if (doc.reopenCycle === currentCycle) {
          sopIssueNo = doc.SOPIssueNo;
          break;
        }
      }

      // Fallback to first doc if no exact match
      if (!sopIssueNo && cycleDocuments.length > 0) {
        sopIssueNo = cycleDocuments[0].SOPIssueNo;
      }

      return {
        reopenCycle: currentCycle,
        SOPIssueNo: sopIssueNo,
        documents: cycleDocuments,
      };
    });

    return result;
  }

  const DocumentsCycle = (process) => {
    // Extract cycles
    const cycles = extractDocumentsByReopenCycle(process);

    // Maximum number of documents in any cycle
    const maxDocs = Math.max(...cycles?.map((cycle) => cycle.documents.length));

    return (
      <CustomCard className={'mt-2'}>
        <h2 className="text-xl font-semibold mb-4">
          Documents by Reopen Cycle
        </h2>

        <div className="overflow-auto">
          <table className="min-w-full border border-gray-300">
            <thead className="bg-gray-100">
              <tr>
                <th className="py-2 px-4 border">System SOP</th>
                <th className="py-2 px-4 border">Manual SOP</th>
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

                    <td className="py-2 px-4 border font-medium">
                      {cycle.SOPIssueNo || '--'}
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
                                  Issue No: {doc?.issueNo || '--'}
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
    try {
      const res = await deleteDocumentInProcess(data);
      setProcess({
        ...process,
        documentVersioning: res?.data?.documentVersioning,
        documents: res?.data?.documents,
        sededDocuments: res?.data?.sededDocuments,
      });
      toast.success(res?.data?.message || 'Document Deleted');
    } catch (error) {
      toast.error(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message,
      );
    }
  };

  useEffect(() => {
    fetchProcess();
    GetRecommendations();
  }, [id]);

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
            variant={'primary'}
            text={'Re-Open'}
            className={'min-w-[150px]'}
            click={() => setOpenModal('re-open')}
            disabled={actionsLoading || !isCompleted || disableActions}
          />
          <CustomButton
            variant={'primary'}
            text={'Upload Document'}
            className={'min-w-[150px]'}
            click={() => setOpenModal('document-upload')}
            disabled={actionsLoading || !isCompleted || disableActions}
          />
          <CustomButton
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
          />
          <CustomButton
            variant={'secondary'}
            text={'Query'}
            className={'min-w-[150px]'}
            click={() => setOpenModal('query')}
            disabled={actionsLoading || isCompleted || disableActions}
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
            text={'Timeline'}
            click={() => navigate(`/timeline/${process?.processId}`)}
            className={'min-w-[150px]'}
            disabled={actionsLoading}
          />
          <CustomButton
            variant={'danger'}
            text={'Complete'}
            click={() => handleCompleteProcess(process?.processStepInstanceId)}
            className={'min-w-[150px]'}
            disabled={
              actionsLoading || isCompleted || process?.toBePicked === true
            }
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

      {/* active document section */}
      {process?.documents?.length > 0 && (
        <>
          {/* Section Header */}
          <div className="flex items-center mt-12 mb-2">
            <div className="flex-grow border-t border-green-600"></div>
            <span className="flex items-center gap-2 mx-4 text-sm text-green-700 uppercase tracking-wide font-semibold">
              <IconFileText size={16} className="text-green-700" />
              Active Documents
            </span>
            <div className="flex-grow border-t border-green-600"></div>
          </div>

          {/* View All Selected Button */}
          <CustomButton
            disabled={selectedDocs.length === 0}
            className="ml-auto mb-4 block"
            text={`View All Selected (${selectedDocs.length})`}
            click={handleViewAllSelectedFiles}
          />

          {/* Document Grid */}
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
                  {/* Top-Right Status Badge */}
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

                  {/* Document Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    {/* Left: Checkbox + Icon + Info */}
                    <div className="flex items-start gap-3 w-full">
                      <input
                        type="checkbox"
                        className="mt-1 shrink-0"
                        checked={isSelected}
                        onChange={toggleSelect}
                      />

                      {/* File Icon */}
                      <div className="w-10 h-10 shrink-0 rounded-full bg-gray-100 border flex items-center justify-center">
                        <img
                          width={28}
                          src={ImageConfig[extension] || ImageConfig['default']}
                          alt="icon"
                        />
                      </div>

                      {/* File Info */}
                      <div className="flex flex-col min-w-0 mr-9">
                        <p className="font-semibold text-gray-900 break-words">
                          {doc.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          Type: {extension}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
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
                      className="px-2"
                      click={() => handleDownloadFile(doc.name, doc.path)}
                      disabled={actionsLoading}
                      title="Download Document"
                      text={<IconDownload size={18} className="text-white" />}
                    /> */}
                    <CustomButton
                      variant="success"
                      className="px-2"
                      click={() =>
                        setRemarksModalOpen({ id: doc.id, open: 'sign' })
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
                        setDeleteConfirm({
                          open: true,
                          documentId: doc.id,
                          documentName: doc.name,
                        })
                      }
                      disabled={
                        actionsLoading || !isCompleted || disableActions
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

      {/* {process?.documentVersioning?.length > 0 && (
        <div className="mt-12">
          <div className="flex items-center mb-4">
            <div className="flex-grow border-t border-green-600"></div>
            <span className="mx-4 text-sm text-green-700 uppercase tracking-wide font-semibold">
              Documents Version History
            </span>
            <div className="flex-grow border-t border-green-600"></div>
          </div>
          <CustomButton
            type={'button'}
            className={'mb-1 ml-auto block'}
            text={'Version Wise'}
            click={() => setOpenModal('version-wise')}
          />

          <div className="space-y-6">
            {process.documentVersioning.map((docGroup, index) => {
              const activeDoc = docGroup.versions.find(
                (v) => v.id === docGroup.latestDocumentId,
              );
              const olderVersions = docGroup.versions.filter(
                (v) => v.id !== docGroup.latestDocumentId,
              );

              return (
                <CustomCard
                  key={index}
                  className="border border-green-200 !bg-green-50 rounded-md shadow-sm p-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3 w-full">
                      <div className="w-10 h-10 rounded-full bg-white border flex items-center justify-center text-green-700 text-xl shrink-0">
                        <img
                          width={30}
                          src={
                            ImageConfig[
                              activeDoc?.name?.split('.').pop()?.toLowerCase()
                            ] || ImageConfig['default']
                          }
                          alt="icon"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 flex items-center gap-2 break-words break-all">
                          {activeDoc?.name}
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full shrink-0">
                            Active
                          </span>
                        </p>
                        <p className="text-sm text-gray-500 truncate">
                          {activeDoc?.path}
                        </p>
                      </div>
                    </div>
                  </div>

                  {olderVersions.length > 0 && (
                    <div className="mt-4 pl-5 border-l-2 border-dashed border-green-300">
                      <p className="text-sm font-medium text-gray-600 mb-2">
                        Previous Versions:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {olderVersions.map((ver) => (
                          <CustomCard
                            key={ver.id}
                            className="flex flex-col justify-between"
                          >
                            <div className="flex gap-3 mb-3">
                              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                                <img
                                  width={24}
                                  src={
                                    ImageConfig[
                                      ver?.name?.split('.').pop()?.toLowerCase()
                                    ] || ImageConfig['default']
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
                                    ver.name?.split('.').pop(),
                                  )
                                }
                                title="View Document"
                                text={
                                  <IconEye size={16} className="text-white" />
                                }
                              />
                              <CustomButton
                                className="px-2"
                                variant="secondary"
                                size="xs"
                                click={() =>
                                  handleDownloadFile(ver.name, ver.path)
                                }
                                title="Download Document"
                                text={
                                  <IconDownload
                                    size={16}
                                    className="text-white"
                                  />
                                }
                              />
                            </div>
                          </CustomCard>
                        ))}
                      </div>
                    </div>
                  )}
                </CustomCard>
              );
            })}
          </div>
        </div>
      )} */}

      {process?.sededDocuments?.length > 0 && (
        <div className="mt-12">
          {/* Section Title */}
          <div className="flex items-center mb-4">
            <div className="flex-grow border-t border-rose-400"></div>
            <span className="mx-4 text-sm text-rose-600 uppercase tracking-wide font-semibold">
              Superseded Documents
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
                  {/* Top-right label */}
                  <div className="absolute bottom-2 right-2">
                    <span className="text-xs border bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full">
                      Superseded
                    </span>
                  </div>

                  {/* Superseded Document */}
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
                        <p className="text-sm text-gray-500">
                          {docGroup.documentWhichSuperseded.path}
                        </p>
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
                      {/* <CustomButton
                        className="px-2"
                        variant="secondary"
                        click={() =>
                          handleDownloadFile(
                            docGroup.documentWhichSuperseded.name,
                            docGroup.documentWhichSuperseded.path,
                          )
                        }
                        title="Download Document"
                        text={<IconDownload size={18} className="text-white" />}
                      /> */}
                    </div>
                  </div>

                  {/* All Versions (no filtering) */}
                  {docGroup.versions.length > 0 && (
                    <div className="mt-4 pl-5 border-l-2 border-dashed border-rose-300">
                      <p className="text-sm font-medium text-gray-600 mb-2">
                        Version History:
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
                                {/* <CustomButton
                                  className="px-2"
                                  variant="secondary"
                                  size="xs"
                                  click={() =>
                                    handleDownloadFile(ver.name, ver.path)
                                  }
                                  title="Download Document"
                                  text={
                                    <IconDownload
                                      size={16}
                                      className="text-white"
                                    />
                                  }
                                /> */}
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

      {process?.queryDetails?.length > 0 && (
        <>
          <div className="flex items-center mt-12 mb-2">
            <div className="flex-grow border-t border-slate-400"></div>
            <span className="mx-4 text-sm text-gray-500 uppercase tracking-wide font-medium">
              Queries
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
                    {query.createdAt && (
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold">Created At:</span>{' '}
                        {new Date(query.createdAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="mt-4 flex justify-end">
                    <CustomButton
                      disabled={actionsLoading || isCompleted || disableActions}
                      text="Solve Query"
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

      {process?.recommendationDetails?.length > 0 && (
        <>
          <div className="flex items-center mt-12 mb-2">
            <div className="flex-grow border-t border-slate-400"></div>
            <span className="mx-4 text-sm text-gray-500 uppercase tracking-wide font-medium">
              Recommendations
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
              {/* <DetailItem label="Tags" value={documentModalOpen?.tags} /> */}
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
          onFinish={(data) =>
            setProcess({
              ...process,
              documentVersioning: data.documentVersioning,
              documents: data.documents,
              sededDocuments: data.sededDocuments,
            })
          }
        />
      </CustomModal>
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
      <RemarksModal
        open={remarksModalOpen.open === 'sign'}
        title="Sign Remarks"
        onClose={() => setRemarksModalOpen({ id: null, open: false })}
        loading={actionsLoading}
        onSubmit={(remarks) => handleSignDocument(remarks)}
        showPassField={false}
      />
      <RemarksModal
        open={remarksModalOpen.open === 'reject'}
        title="Reject Remarks"
        onClose={() => setRemarksModalOpen({ id: null, open: false })}
        loading={actionsLoading}
        onSubmit={(remarks) => handleRejectDocument(remarks)}
      />

      {/* Delete Confirmation Modal */}
      <CustomModal
        isOpen={deleteConfirm.open}
        onClose={() =>
          setDeleteConfirm({
            open: false,
            documentId: null,
            documentName: null,
          })
        }
        className="max-w-md"
      >
        <div className="p-6">
          <h3 className="text-lg font-semibold text-red-700 mb-4">
            Permanently Delete Document?
          </h3>
          <p className="text-gray-700 mb-6">
            You're going to <strong>permanently delete</strong> the document:
            <br />
            <span className="font-medium text-red-600">
              "{deleteConfirm.documentName}"
            </span>
            <br />
            <br />
            This action <strong>cannot be undone</strong>. Are you sure?
          </p>
          <div className="flex justify-end gap-3">
            <CustomButton
              variant="secondary"
              text="Cancel"
              click={() =>
                setDeleteConfirm({
                  open: false,
                  documentId: null,
                  documentName: null,
                })
              }
            />
            <CustomButton
              variant="danger"
              text="Yes, Delete Permanently"
              loading={actionsLoading}
              click={async () => {
                await DeleteDocument({
                  documentId: deleteConfirm.documentId,
                  processId: process?.processId,
                });
                setDeleteConfirm({
                  open: false,
                  documentId: null,
                  documentName: null,
                });
              }}
            />
          </div>
        </div>
      </CustomModal>
    </div>
  );
};

export default ViewProcess;
