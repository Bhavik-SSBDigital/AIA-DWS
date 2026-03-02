import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getRecommendationDetails,
  signRecommendDocument,
  ViewDocument,
} from '../../common/Apis';
import CustomCard from '../../CustomComponents/CustomCard';
import ComponentLoader from '../../common/Loader/ComponentLoader';
import CustomButton from '../../CustomComponents/CustomButton';
import ViewFile from '../view/View';
import { toast } from 'react-toastify';
import TopLoader from '../../common/Loader/TopLoader';
import { IconArrowLeft, IconCheck, IconEye, IconFile } from '@tabler/icons-react';
import RemarksModal from '../../CustomComponents/RemarksModal';
import CustomModal from '../../CustomComponents/CustomModal';
import RespondRecommendation from './Actions/RespondRecommendation';

// Helper to get a file icon based on extension
const getFileIcon = (fileName) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return <IconFile className="text-red-500" size={24} />;
    case 'doc':
    case 'docx':
      return <IconFile className="text-blue-500" size={24} />;
    case 'xls':
    case 'xlsx':
      return <IconFile className="text-green-500" size={24} />;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
      return <IconFile className="text-purple-500" size={24} />;
    default:
      return <IconFile className="text-gray-500" size={24} />;
  }
};

const ViewRecommendation = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [data, setData] = useState();
  const [fileView, setFileView] = useState(null);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [remarksModalOpen, setRemarksModalOpen] = useState({
    id: null,
    open: false,
  });
  const [openModal, setOpenModal] = useState('');

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

  const handleViewAllSelectedFiles = async () => {
    setActionsLoading(true);
    try {
      const selected = data.documentSummaries.filter((doc) =>
        selectedDocs.includes(doc.documentId)
      );
      const formattedDocs = await Promise.all(
        selected.map(async (doc) => {
          const res = await ViewDocument(doc.documentName, doc.documentPath);
          return {
            url: res.data,
            type: res.fileType,
            name: doc.name,
            fileId: doc.id,
            signed: doc.signed,
          };
        })
      );
      setFileView({ multi: true, docs: formattedDocs });
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
    }
  };

  const handleSignDocument = async (reason) => {
    try {
      const response = await signRecommendDocument({
        reason,
        documentId: remarksModalOpen.id,
        recommendationId: data?.recommendationId,
      });
      toast.success(response?.data?.message);
      setRemarksModalOpen({ id: null, open: false });
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    }
  };

  const handleBack = () => {
    navigate(-1);
  };

  const fetchData = async () => {
    try {
      const response = await getRecommendationDetails(id);
      setData(response?.data?.recommendation);
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const recommendationDetails = [
    { label: 'Recommendation ID', value: data?.recommendationId },
    { label: 'Process ID', value: data?.processId },
    { label: 'Process Name', value: data?.processName || 'N/A' },
    { label: 'Initiator Name', value: data?.initiatorUsername || 'Unknown' },
    {
      label: 'Recommendation Text',
      value: data?.recommendationText ? (
        <div className="max-h-24 overflow-y-auto p-2 bg-white rounded border border-gray-200 text-sm">
          {data.recommendationText}
        </div>
      ) : (
        'N/A'
      ),
    },
    {
      label: 'Status',
      value: (
        <span
          className={`px-3 py-1 rounded-full text-white text-sm font-semibold inline-block ${
            data?.status === 'PENDING'
              ? 'bg-yellow-500'
              : data?.status === 'OPEN'
              ? 'bg-blue-500'
              : 'bg-green-500'
          }`}
        >
          {data?.status}
        </span>
      ),
    },
    {
      label: 'Created At',
      value: data?.createdAt
        ? new Date(data.createdAt).toLocaleString()
        : 'N/A',
    },
    {
      label: 'Responded At',
      value: data?.respondedAt
        ? new Date(data.respondedAt).toLocaleString()
        : 'N/A',
    },
    {
      label: 'Response Text',
      value: data?.responseText || 'N/A',
    },
  ];

  if (loading) return <ComponentLoader />;
  if (error)
    return (
      <CustomCard className="p-8 text-center">
        <p className="text-lg font-semibold text-red-600">Error: {error}</p>
        <div className="mt-6">
          <CustomButton
            click={() => navigate('/processes/work')}
            text="Go Back"
            variant="primary"
          />
        </div>
      </CustomCard>
    );

  if (!data)
    return (
      <div className="text-center text-gray-500 py-16 bg-white rounded-lg shadow">
        <p className="text-xl">No recommendation data available</p>
      </div>
    );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {actionsLoading && <TopLoader />}

      {/* Header with actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Recommendation Details</h1>
        <div className="flex gap-3">
          <CustomButton
            variant="primary"
            text={
              <div className="flex items-center gap-2">
                <span>Respond</span>
              </div>
            }
            click={() => setOpenModal('recommend')}
            disabled={actionsLoading}
          />
          <CustomButton
            variant="outline"
            text={
              <div className="flex items-center gap-2">
                <IconArrowLeft size={18} />
                <span>Back to List</span>
              </div>
            }
            click={handleBack}
            disabled={actionsLoading}
          />
        </div>
      </div>

      {/* Recommendation details grid */}
      <CustomCard className="mb-8 p-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-700 border-b pb-2">Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {recommendationDetails.map((detail, index) => (
            <div key={index} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <p className="text-sm font-medium text-gray-500 mb-1">{detail.label}</p>
              <div className="text-base text-gray-900">{detail.value}</div>
            </div>
          ))}
        </div>
      </CustomCard>

      {/* Documents section */}
      {data?.documentSummaries?.length > 0 && (
        <>
          <div className="flex items-center my-8">
            <div className="flex-grow border-t border-gray-300"></div>
            <span className="mx-4 text-sm font-semibold text-gray-600 uppercase tracking-wider">
              Documents ({data.documentSummaries.length})
            </span>
            <div className="flex-grow border-t border-gray-300"></div>
          </div>

          {/* Optional: uncomment below to enable multi-select view */}
          {/* {selectedDocs.length > 0 && (
            <div className="flex justify-end mb-4">
              <CustomButton
                disabled={selectedDocs.length === 0}
                text={`View Selected (${selectedDocs.length})`}
                click={handleViewAllSelectedFiles}
                variant="secondary"
                size="sm"
              />
            </div>
          )} */}

          <div className="space-y-4">
            {data.documentSummaries.map((doc) => {
              const isSelected = selectedDocs.includes(doc.documentId);
              const toggleSelect = () => {
                setSelectedDocs((prev) =>
                  isSelected
                    ? prev.filter((id) => id !== doc.documentId)
                    : [...prev, doc.documentId]
                );
              };

              return (
                <CustomCard
                  key={doc.documentId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-5 gap-4 hover:shadow-md transition-shadow duration-200"
                >
                  <div className="flex items-start gap-4 flex-1">
                    {/* Optional checkbox for multi-select */}
                    {/* <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={isSelected}
                      onChange={toggleSelect}
                    /> */}
                    
                    {/* File icon */}
                    <div className="flex-shrink-0">
                      {getFileIcon(doc.documentName)}
                    </div>

                    {/* Document info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 font-semibold truncate" title={doc.documentName}>
                        {doc.documentName}
                      </p>
                      <p className="text-gray-600 text-sm mt-1 line-clamp-2" title={doc.queryText}>
                        Query: {doc.queryText}
                      </p>
                      <div className="mt-2">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            doc.requiresApproval
                              ? 'bg-red-100 text-red-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {doc.requiresApproval ? 'Requires Approval' : 'No Approval Needed'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 sm:flex-nowrap flex-wrap justify-end">
                    <CustomButton
                      size="sm"
                      variant="outline"
                      click={() =>
                        handleViewFile(
                          doc.documentName,
                          doc.documentPath,
                          doc.documentId,
                          doc.documentName.split('.').pop()
                        )
                      }
                      disabled={actionsLoading}
                      title="View Document"
                      text={
                        <div className="flex items-center gap-1">
                          <IconEye size={18} />
                          <span>View</span>
                        </div>
                      }
                    />
                    {doc.requiresApproval && (
                      <CustomButton
                        size="sm"
                        variant="success"
                        click={() =>
                          setRemarksModalOpen({
                            id: doc.documentId,
                            open: 'sign',
                          })
                        }
                        disabled={actionsLoading}
                        title="Sign Document"
                        text={
                          <div className="flex items-center gap-1">
                            <IconCheck size={18} />
                            <span>Sign</span>
                          </div>
                        }
                      />
                    )}
                  </div>
                </CustomCard>
              );
            })}
          </div>
        </>
      )}

      {/* File viewer modal */}
      {fileView && (
        <ViewFile
          docu={fileView}
          setFileView={setFileView}
          handleViewClose={() => setFileView(null)}
        />
      )}

      {/* Respond recommendation modal */}
      <CustomModal
        isOpen={openModal === 'recommend'}
        onClose={() => setOpenModal('')}
        className="max-h-[95vh] overflow-auto max-w-lg w-full"
      >
        <RespondRecommendation
          recommendationId={data?.recommendationId}
          close={() => setOpenModal('')}
          documents={data?.documentSummaries || []}
        />
      </CustomModal>

      {/* Sign remarks modal */}
      <RemarksModal
        open={remarksModalOpen.open === 'sign'}
        title="Sign Remarks"
        onClose={() => setRemarksModalOpen({ id: null, open: false })}
        loading={actionsLoading}
        onSubmit={(remarks) => handleSignDocument(remarks)}
      />
    </div>
  );
};

export default ViewRecommendation;