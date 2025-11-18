import React, { useState } from 'react';
import html2pdf from 'html2pdf.js';
import {
  IconCheck,
  IconX,
  IconClock,
  IconFileText,
  IconMessageCircle,
  IconArrowRight,
  IconUserCheck,
  IconAlertCircle,
  IconInfoCircle,
  IconThumbUp,
  IconCheckupList,
  IconSignature,
  IconUpload,
  IconChevronUp,
  IconChevronDown,
  IconFileArrowRight,
  IconArrowLeft,
  IconEye,
} from '@tabler/icons-react';
import TimelineLegend from './TimelineLegend';
import CustomButton from '../../CustomComponents/CustomButton';
import { ViewDocument } from '../../common/Apis';
import ViewFile from '../view/View';
import CustomCard from '../../CustomComponents/CustomCard';
import Show from '../workflows/Show';
import { useNavigate } from 'react-router-dom';
import { ImageConfig } from '../../config/ImageConfig';
import ReOpenProcessModal from '../Processes/Actions/ReOpenProcessModal';
import CustomModal from '../../CustomComponents/CustomModal';

const iconMap = {
  PROCESS_INITIATED: <IconInfoCircle size={20} className="text-blue-600" />,
  DOCUMENT_SIGNED: <IconSignature size={20} className="text-green-600" />,
  DOCUMENT_REJECTED: <IconX size={20} className="text-red-600" />,
  QUERY_RAISED: <IconAlertCircle size={20} className="text-yellow-600" />,
  QUERY_RESOLVED: <IconCheckupList size={20} className="text-green-600" />,
  RECOMMENDATION_REQUESTED: (
    <IconMessageCircle size={20} className="text-purple-600" />
  ),
  RECOMMENDATION_PROVIDED: (
    <IconThumbUp size={20} className="text-purple-800" />
  ),
  STEP_COMPLETED: <IconCheck size={20} className="text-green-700" />,
  DOCUMENT_UPLOADED: <IconUpload size={20} className="text-green-700" />,
};

const Timeline = ({
  activities,
  setActionsLoading,
  actionsLoading,
  workflow,
  print,
  id,
  process,
  reOpen,
}) => {
  const navigate = useNavigate();

  // handlers
  const handleViewAllSelectedFiles = async (documents) => {
    setActionsLoading(true);
    try {
      const formattedDocs = await Promise.all(
        documents.map(async (doc) => {
          const res = await ViewDocument(doc.name, doc.path);
          return {
            url: res.data,
            type: res.fileType,
            name: doc.name,
            fileId: doc.id,
            signed: doc.signed,
          };
        }),
      );
      setFileView({ multi: true, docs: formattedDocs });
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
    }
  };
  const logDetails = [
    // { label: 'Step Name', value: data?.stepName || '--' },
    { label: 'Process ID', value: process?.processId || '--' },
    { label: 'Process Name', value: process?.processName || '--' },
    // { label: 'Recirculation Cycle', value: data?.recirculationCycle || '--' },
    // { label: 'Step Instance ID', value: data?.processStepInstanceId || '--' },
  ];

  const renderDetails = (activity) => {
    const { actionType, details = {} } = activity;

    switch (actionType) {
      case 'DOCUMENT_UPLOADED':
        return (
          <div className="timeline-item p-4 border-l-4 border-indigo-500 bg-indigo-50 rounded-md mb-4">
            <div className="text-indigo-700 space-y-1">
              <p>
                <strong>Uploaded By:</strong> {details?.uploadedBy || 'N/A'}
              </p>
              <p>
                <strong>Workflow:</strong> {details?.workflow || 'N/A'}
              </p>
              {/* <p>
                <strong>Step:</strong> {details?.stepName || 'N/A'}
              </p> */}
              {/* <p>
                <strong>Tags:</strong>{' '}
                {details?.tags && details?.tags.length > 0
                  ? details?.tags.join(', ')
                  : 'N/A'}
              </p> */}
              <p>
                <strong>Document:</strong> {details?.name || 'N/A'}{' '}
                {details?.name && details?.path && (
                  <CustomButton
                    disabled={actionsLoading}
                    click={() =>
                      handleView(
                        details?.name,
                        details?.path,
                        details?.documentId,
                        details?.type,
                      )
                    }
                    variant="info"
                    type="button"
                    text="View"
                    className="ml-2"
                  />
                )}
              </p>
            </div>
          </div>
        );

      case 'PROCESS_INITIATED':
        return (
          <div className="timeline-item p-4 border-l-4 border-blue-500 bg-blue-50 rounded-md mb-4">
            <div className="text-sm text-gray-500 mb-1">
              {new Date(details?.createdAt).toLocaleString()}
            </div>
            <p className="text-gray-700">
              <strong>Initiator:</strong> {details.initiatorName || 'N/A'}{' '}
              <br />
              <strong>Process:</strong> {details.processName || 'N/A'}
            </p>
            <p className="mt-2 text-gray-600 italic">{details?.description}</p>
          </div>
        );

      case 'DOCUMENT_SIGNED':
        return (
          <div className="timeline-item p-4 border-l-4 border-green-500 bg-green-50 rounded-md mb-4">
            <div className="text-sm text-gray-500 mb-1">
              {new Date(details?.createdAt).toLocaleString()}
            </div>
            <div className="text-green-700 space-y-1">
              <p>
                <strong>Signed By:</strong> {details.signedBy || 'N/A'}
              </p>
              <p>
                <strong>Signed At:</strong>{' '}
                {details.signedAt
                  ? new Date(details.signedAt).toLocaleString()
                  : 'N/A'}
              </p>
              {details.remarks && (
                <p>
                  <strong>Remarks:</strong> {details.remarks}
                </p>
              )}
              <p>
                <strong>Document:</strong> {details.name || 'N/A'}{' '}
                {details.name && details.path && (
                  <CustomButton
                    disabled={actionsLoading}
                    click={() =>
                      handleView(
                        details.name,
                        details.path,
                        details.id,
                        details.type,
                      )
                    }
                    variant={'success'}
                    type="button"
                    text={'View'}
                    className={'ml-2'}
                  ></CustomButton>
                )}
              </p>
            </div>
            <p className="mt-2 text-gray-600 italic">{details?.description}</p>
          </div>
        );

      case 'DOCUMENT_REJECTED':
        return (
          <div className="timeline-item p-4 border-l-4 border-red-600 bg-red-50 rounded-md mb-4">
            <div className="text-sm text-gray-500 mb-1">
              {new Date(details?.createdAt).toLocaleString()}
            </div>
            <div className="text-red-700 space-y-1">
              <p>
                <strong>Rejected By:</strong> {details.rejectedBy || 'N/A'}
              </p>
              <p>
                <strong>Reason:</strong> {details.rejectionReason || 'N/A'}
              </p>
              <p>
                <strong>Rejected At:</strong>{' '}
                {details.rejectedAt
                  ? new Date(details.rejectedAt).toLocaleString()
                  : 'N/A'}
              </p>
              <p>
                <strong>Document:</strong> {details.name || 'N/A'}{' '}
                {details.name && details.path && (
                  <CustomButton
                    disabled={actionsLoading}
                    click={() =>
                      handleView(
                        details.name,
                        details.path,
                        details.id,
                        details.type,
                      )
                    }
                    variant={'danger'}
                    type="button"
                    text={'View'}
                    className={'ml-2'}
                  ></CustomButton>
                )}
              </p>
            </div>
            <p className="mt-2 text-gray-600 italic">{details?.description}</p>
          </div>
        );

      case 'QUERY_RAISED':
        return (
          <div className="timeline-item p-4 border-l-4 border-yellow-500 bg-yellow-50 rounded-md mb-4">
            <div className="text-yellow-700 space-y-2">
              <p>
                <strong>Step:</strong> {details.stepName || 'N/A'}
              </p>
              <p>
                <strong>Query:</strong> {details.queryText || 'N/A'}
              </p>
              <p>
                <strong>Initiator:</strong> {details.initiatorName || 'N/A'}
              </p>

              {/* Document Changes */}
              {details.documentChanges?.length > 0 && (
                <div className="ml-4 border-l-2 border-yellow-400 pl-4 space-y-3 mt-3 bg-yellow-100 p-3 rounded">
                  <strong className="block mb-2 text-yellow-800">
                    Document Changes:
                  </strong>
                  {details.documentChanges.map((doc, i) => (
                    <div key={i} className="space-y-1">
                      <p>
                        <strong>Document:</strong> {doc.document?.name || 'N/A'}
                        {doc.document?.name && doc.document?.path && (
                          <CustomButton
                            disabled={actionsLoading}
                            click={() =>
                              handleView(
                                doc.document.name,
                                doc.document.path,
                                doc.document.id,
                                doc.document.type,
                              )
                            }
                            variant="warning"
                            type="button"
                            text="View"
                            className="ml-2"
                          />
                        )}
                      </p>

                      {doc.replacedDocument && (
                        <p>
                          <strong>Replaced:</strong> {doc.replacedDocument.name}
                          {doc.replacedDocument.path && (
                            <CustomButton
                              disabled={actionsLoading}
                              click={() =>
                                handleView(
                                  doc.replacedDocument.name,
                                  doc.replacedDocument.path,
                                  doc.replacedDocument.id,
                                  doc.replacedDocument.type,
                                )
                              }
                              variant="warning"
                              type="button"
                              text="View"
                              className="ml-2"
                            />
                          )}
                        </p>
                      )}

                      {doc.document && doc.replacedDocument && (
                        <div>
                          <CustomButton
                            disabled={actionsLoading}
                            click={() =>
                              handleViewAllSelectedFiles([
                                {
                                  id: doc.document.id,
                                  name: doc.document.name,
                                  path: doc.document.path,
                                  signed: doc.document.signed,
                                },
                                {
                                  id: doc.replacedDocument.id,
                                  name: doc.replacedDocument.name,
                                  path: doc.replacedDocument.path,
                                  signed: doc.replacedDocument.signed,
                                },
                              ])
                            }
                            variant="warning"
                            type="button"
                            text="View Both"
                            className="mt-1"
                          />
                        </div>
                      )}

                      <p>
                        <strong>Requires Approval:</strong>{' '}
                        {doc.requiresApproval ? 'Yes' : 'No'}
                      </p>
                      {doc.actionDetails?.length > 0 && (
                        <p>
                          <strong>Actions:</strong>{' '}
                          {doc.actionDetails.join(', ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Document Summaries */}
              {details.documentSummaries?.length > 0 && (
                <div className="ml-4 border-l-2 border-yellow-400 pl-4 space-y-3 mt-3 bg-yellow-100 p-3 rounded">
                  <strong className="block mb-2 text-yellow-800">
                    Document Feedback:
                  </strong>
                  {details.documentSummaries.map((summary, i) => (
                    <div key={i} className="space-y-1">
                      <p>
                        <strong>Document:</strong>{' '}
                        {summary.documentDetails?.name || 'N/A'}
                        {summary.documentDetails?.name &&
                          summary.documentDetails?.path && (
                            <CustomButton
                              disabled={actionsLoading}
                              click={() =>
                                handleView(
                                  summary.documentDetails.name,
                                  summary.documentDetails.path,
                                  summary.documentDetails.id,
                                  summary.documentDetails.type,
                                )
                              }
                              className={'ml-2'}
                              variant={'warning'}
                              text={'View'}
                              type="button"
                            ></CustomButton>
                          )}
                      </p>
                      <p>
                        <strong>Feedback:</strong>{' '}
                        {summary.feedbackText || 'N/A'}
                      </p>
                      <p>
                        <strong>User:</strong> {summary.user || 'N/A'}
                      </p>
                      <p>
                        <strong>Given At:</strong>{' '}
                        {summary.createdAt
                          ? new Date(summary.createdAt).toLocaleString()
                          : 'N/A'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="mt-2 text-gray-600 italic">{details?.description}</p>
          </div>
        );

      case 'QUERY_RESOLVED':
        return (
          <div className="timeline-item p-4 border-l-4 border-green-600 bg-green-50 rounded-md mb-4">
            <div className="text-green-700 space-y-2">
              <p>
                <strong>Step:</strong> {details.stepName || 'N/A'}
              </p>
              <p>
                <strong>Query:</strong> {details.queryText || 'N/A'}
              </p>
              <p>
                <strong>Answer:</strong> {details.answerText || 'N/A'}
              </p>
              <p>
                <strong>Answered At:</strong>{' '}
                {details.answeredAt
                  ? new Date(details.answeredAt).toLocaleString()
                  : 'N/A'}
              </p>

              {/* Document Changes */}
              {details.documentChanges?.length > 0 && (
                <div className="ml-4 border-l-2 border-green-400 pl-4 space-y-3 mt-3 bg-green-100 p-3 rounded">
                  <strong className="block mb-2 text-green-800">
                    Document Changes:
                  </strong>
                  {details.documentChanges.map((doc, i) => (
                    <div key={i} className="space-y-1">
                      <p>
                        <strong>Document:</strong> {doc.document?.name || 'N/A'}
                        {doc.document?.name && doc.document?.path && (
                          <CustomButton
                            disabled={actionsLoading}
                            click={() =>
                              handleView(
                                doc.document.name,
                                doc.document.path,
                                doc.document.id,
                                doc.document.type,
                              )
                            }
                            variant="success"
                            type="button"
                            text="View"
                            className="ml-2"
                          />
                        )}
                      </p>

                      {doc.replacedDocument && (
                        <p>
                          <strong>Replaced:</strong> {doc.replacedDocument.name}
                          {doc.replacedDocument.path && (
                            <CustomButton
                              disabled={actionsLoading}
                              click={() =>
                                handleView(
                                  doc.replacedDocument.name,
                                  doc.replacedDocument.path,
                                  doc.replacedDocument.id,
                                  doc.replacedDocument.type,
                                )
                              }
                              variant="success"
                              type="button"
                              text="View"
                              className="ml-2"
                            />
                          )}
                        </p>
                      )}

                      {doc.document && doc.replacedDocument && (
                        <div>
                          <CustomButton
                            disabled={actionsLoading}
                            click={() =>
                              handleViewAllSelectedFiles([
                                {
                                  id: doc.document.id,
                                  name: doc.document.name,
                                  path: doc.document.path,
                                  signed: doc.document.signed,
                                },
                                {
                                  id: doc.replacedDocument.id,
                                  name: doc.replacedDocument.name,
                                  path: doc.replacedDocument.path,
                                  signed: doc.replacedDocument.signed,
                                },
                              ])
                            }
                            variant="success"
                            type="button"
                            text="View Both"
                            className="mt-1"
                          />
                        </div>
                      )}

                      <p>
                        <strong>Requires Approval:</strong>{' '}
                        {doc.requiresApproval ? 'Yes' : 'No'}
                      </p>
                      {doc.actionDetails?.length > 0 && (
                        <p>
                          <strong>Actions:</strong>{' '}
                          {doc.actionDetails.join(', ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Document Summaries */}
              {details.documentSummaries?.length > 0 && (
                <div className="ml-4 border-l-2 border-green-400 pl-4 space-y-3 mt-3 bg-green-100 p-3 rounded">
                  <strong className="block mb-2 text-green-800">
                    Document Feedback:
                  </strong>
                  {details.documentSummaries.map((summary, i) => (
                    <div key={i} className="space-y-1">
                      <p>
                        <strong>Document:</strong>{' '}
                        {summary.documentDetails?.name || 'N/A'}
                        {summary.documentDetails?.name &&
                          summary.documentDetails?.path && (
                            <CustomButton
                              disabled={actionsLoading}
                              click={() =>
                                handleView(
                                  summary.documentDetails.name,
                                  summary.documentDetails.path,
                                  summary.documentDetails.id,
                                  summary.documentDetails.type,
                                )
                              }
                              className={'ml-2'}
                              variant={'success'}
                              type="button"
                              text={'View'}
                            ></CustomButton>
                          )}
                      </p>
                      <p>
                        <strong>Feedback:</strong>{' '}
                        {summary.feedbackText || 'N/A'}
                      </p>
                      <p>
                        <strong>User:</strong> {summary.user || 'N/A'}
                      </p>
                      <p>
                        <strong>Given At:</strong>{' '}
                        {summary.createdAt
                          ? new Date(summary.createdAt).toLocaleString()
                          : 'N/A'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="mt-2 text-gray-600 italic">{details?.description}</p>
          </div>
        );

      case 'RECOMMENDATION_REQUESTED':
        return (
          <div className="timeline-item p-4 border-l-4 border-purple-600 bg-purple-50 rounded-md mb-4">
            <div className="text-purple-700 space-y-1">
              <p>
                <strong>Step:</strong> {details.stepName || 'N/A'}
              </p>
              <p>
                <strong>Recommendation Text:</strong>{' '}
                {details.recommendationText || 'N/A'}
              </p>
              <p>
                <strong>Initiator:</strong> {details.initiatorName || 'N/A'}
              </p>
              <p>
                <strong>Status:</strong> {details.status || 'N/A'}
              </p>
              {details.documentDetails &&
                details.documentDetails.length > 0 && (
                  <div className="ml-4 border-l-2 border-purple-400 pl-4 mt-2 space-y-1 bg-purple-100 p-3 rounded">
                    <strong className="block text-purple-800 mb-1">
                      Related Documents:
                    </strong>
                    {details.documentDetails.map((doc, i) => (
                      <p key={i} className="flex items-center justify-between">
                        <span>{doc.documentName}</span>
                        {doc.documentPath && (
                          <CustomButton
                            disabled={actionsLoading}
                            click={() =>
                              handleView(
                                doc.documentName,
                                doc.documentPath,
                                doc.documentId,
                                doc.documentType,
                              )
                            }
                            className={'ml-2'}
                            variant={'info'}
                            type="button"
                            text={'View'}
                          ></CustomButton>
                        )}
                      </p>
                    ))}
                  </div>
                )}
              {/* Document Changes */}
              {details.documentChanges?.length > 0 && (
                <div className="ml-4 border-l-2 border-purple-400 pl-4 space-y-3 mt-3 bg-purple-100 p-3 rounded">
                  <strong className="block mb-2 text-purple-800">
                    Document Changes:
                  </strong>
                  {details.documentChanges.map((doc, i) => (
                    <div key={i} className="space-y-1">
                      <p>
                        <strong>Document:</strong> {doc.document?.name || 'N/A'}
                        {doc.document?.name && doc.document?.path && (
                          <CustomButton
                            disabled={actionsLoading}
                            click={() =>
                              handleView(
                                doc.document.name,
                                doc.document.path,
                                doc.document.id,
                                doc.document.type,
                              )
                            }
                            variant="info"
                            type="button"
                            text="View"
                            className="ml-2"
                          />
                        )}
                      </p>

                      {doc.replacedDocument && (
                        <p>
                          <strong>Replaced:</strong> {doc.replacedDocument.name}
                          {doc.replacedDocument.path && (
                            <CustomButton
                              disabled={actionsLoading}
                              click={() =>
                                handleView(
                                  doc.replacedDocument.name,
                                  doc.replacedDocument.path,
                                  doc.replacedDocument.id,
                                  doc.replacedDocument.type,
                                )
                              }
                              variant="info"
                              type="button"
                              text="View"
                              className="ml-2"
                            />
                          )}
                        </p>
                      )}

                      {doc.document && doc.replacedDocument && (
                        <div>
                          <CustomButton
                            disabled={actionsLoading}
                            click={() =>
                              handleViewAllSelectedFiles([
                                {
                                  id: doc.document.id,
                                  name: doc.document.name,
                                  path: doc.document.path,
                                  signed: doc.document.signed,
                                },
                                {
                                  id: doc.replacedDocument.id,
                                  name: doc.replacedDocument.name,
                                  path: doc.replacedDocument.path,
                                  signed: doc.replacedDocument.signed,
                                },
                              ])
                            }
                            variant="info"
                            type="button"
                            text="View Both"
                            className="mt-1"
                          />
                        </div>
                      )}

                      <p>
                        <strong>Requires Approval:</strong>{' '}
                        {doc.requiresApproval ? 'Yes' : 'No'}
                      </p>
                      {doc.actionDetails?.length > 0 && (
                        <p>
                          <strong>Actions:</strong>{' '}
                          {doc.actionDetails.join(', ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-2 text-gray-600 italic">{details?.description}</p>
          </div>
        );

      case 'RECOMMENDATION_PROVIDED':
        return (
          <div className="timeline-item p-4 border-l-4 border-purple-800 bg-purple-100 rounded-md mb-4">
            <div className="text-purple-900 space-y-1">
              <p>
                <strong>Step:</strong> {details.stepName || 'N/A'}
              </p>
              <p>
                <strong>Recommendation Text:</strong>{' '}
                {details.recommendationText || 'N/A'}
              </p>
              <p>
                <strong>Response Text:</strong> {details.responseText || 'N/A'}
              </p>
              <p>
                <strong>Responded At:</strong>{' '}
                {details.respondedAt
                  ? new Date(details.respondedAt).toLocaleString()
                  : 'N/A'}
              </p>

              {/* Related Documents */}
              {details.documentDetails?.length > 0 && (
                <div className="ml-4 border-l-2 border-purple-600 pl-4 mt-2 space-y-1 bg-purple-200 p-3 rounded">
                  <strong className="block text-purple-900 mb-1">
                    Related Documents:
                  </strong>
                  {details.documentDetails.map((doc, i) => (
                    <p key={i} className="flex items-center justify-between">
                      <span>{doc.documentName}</span>
                      {doc.documentPath && (
                        <CustomButton
                          disabled={actionsLoading}
                          click={() =>
                            handleView(
                              doc.documentName,
                              doc.documentPath,
                              doc.documentId,
                              doc.documentType,
                            )
                          }
                          className={'ml-2'}
                          variant={'info'}
                          type="button"
                          text={'View'}
                        ></CustomButton>
                      )}
                    </p>
                  ))}
                </div>
              )}

              {/* Document Responses */}
              {details.documentResponses?.length > 0 && (
                <div className="ml-4 border-l-2 border-purple-600 pl-4 mt-3 space-y-1 bg-purple-200 p-3 rounded">
                  <strong className="block text-purple-900 mb-1">
                    Document Responses:
                  </strong>
                  {details.documentResponses.map((response, i) => (
                    <p key={i}>
                      <strong>Document ID:</strong>{' '}
                      {response.documentId || 'N/A'}
                      <br />
                      <strong>Answer:</strong> {response.answerText || 'N/A'}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <p className="mt-2 text-gray-600 italic">{details?.description}</p>
          </div>
        );

      case 'STEP_COMPLETED':
        return (
          <div className="timeline-item p-4 border-l-4 border-green-600 bg-green-50 rounded-md mb-4">
            <p className="text-green-700 font-semibold">
              <strong>Step Completed:</strong> {details.stepName || 'N/A'}
            </p>
            <p className="mt-1 text-gray-600 italic">{details?.description}</p>
          </div>
        );

      default:
        return <p className="text-gray-600 italic">No additional details</p>;
    }
  };

  const exportDivToPDF = () => {
    setActionsLoading(true);
    const element = document.getElementById('reportDiv');
    const opt = {
      margin: 0.5,
      filename: `${id}imeline.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
    };
    html2pdf().from(element).set(opt).save();
    setActionsLoading(false);
  };

  //   states
  const [fileView, setFileView] = useState(null);
  const [openModal, setOpenModal] = useState('');
  const [expanded, setExpanded] = useState(false);
  // handlers
  const handleView = async (name, path, fileId, type, isEditing) => {
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
  const handleBack = () => {
    navigate(-1);
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

        <div className="overflow-x-auto">
          <table className="min-w-full border border-gray-300">
            <thead className="bg-gray-100">
              <tr>
                <th className="py-2 px-4 border">SOP</th>
                <th className="py-2 px-4 border">Process SOP</th>
                {Array.from({ length: maxDocs }).map((_, idx) => (
                  <th key={idx} className="py-2 px-4 border">
                    Document {idx + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cycles.map((cycle) => (
                <tr key={cycle.reopenCycle}>
                  <td className="py-2 px-4 border font-medium">
                    {cycle.reopenCycle}
                  </td>
                  <td className="py-2 px-4 border font-medium">
                    {cycle.SOPIssueNo || '--'}
                  </td>

                  {Array.from({ length: maxDocs }).map((_, idx) => {
                    const doc = cycle.documents[idx];

                    return (
                      <td key={idx} className="py-2 px-4 border">
                        {doc ? (
                          <div className="flex items-center space-x-2">
                            {/* Document icon */}
                            <img
                              width={28}
                              src={
                                ImageConfig[doc.type] || ImageConfig['default']
                              }
                              alt={doc.type}
                            />
                            <div className="flex flex-col">
                              {/* Document name */}
                              <span
                                title={doc.name}
                                className={`truncate ${doc.active ? 'font-semibold' : 'text-gray-400'}`}
                              >
                                {doc.name}
                              </span>
                              {/* Highlight issueNo */}

                              <span className="text-sm text-blue-600 font-medium">
                                Issue No: {doc?.issueNo || '--'}
                              </span>
                            </div>
                            <CustomButton
                              className="px-2"
                              click={() =>
                                handleView(
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
                          </div>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CustomCard>
    );
  };

  return (
    <>
      <div className="space-y-5 mt-2">
        <CustomCard>
          <div className="flex justify-end flex-row gap-2 flex-wrap">
            <CustomButton
              variant={'primary'}
              text={'Re-Open'}
              className={'min-w-[150px]'}
              click={() => setOpenModal('re-open')}
              disabled={actionsLoading || !reOpen}
            />

            <CustomButton
              variant={'none'}
              text={
                <div className="flex items-center  gap-2">
                  <IconArrowLeft size={18} /> List
                </div>
              }
              click={handleBack}
              disabled={actionsLoading}
            />
          </div>
          <hr className="text-slate-200 my-2" />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {logDetails?.map((detail, index) => (
              <div
                key={index}
                className="p-4 border border-slate-300 bg-zinc-50 rounded-lg shadow-sm"
              >
                <p className="font-semibold text-lg">{detail.label}</p>
                <p>{detail.value}</p>
              </div>
            ))}
          </div>
          {process?.documentVersioning && DocumentsCycle(process)}
        </CustomCard>
        <TimelineLegend />
        <CustomCard className="transition-all duration-300 ease-in-out">
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between text-left text-green-700 font-semibold mb-2 hover:underline"
          >
            <span>Workflow</span>
            {expanded ? (
              <IconChevronUp className="transition-transform duration-300" />
            ) : (
              <IconChevronDown className="transition-transform duration-300" />
            )}
          </button>

          <div
            className={`transition-all duration-500 ease-in-out overflow-hidden ${
              expanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <Show steps={workflow} />
          </div>
        </CustomCard>
        <div id="reportDiv" className="space-y-4">
          <div className="flex justify-center gap-3 align-middle">
            <h2 className="text-2xl text-center font-bold underline text-gray-900">
              Timeline
            </h2>
            {print ? (
              <CustomButton
                disabled={actionsLoading}
                variant={'none'}
                text={<IconFileArrowRight />}
                click={exportDivToPDF}
                title={'Export Timeline'}
              />
            ) : null}
          </div>
          {activities.map((activity, idx) => {
            const Icon = iconMap[activity.actionType] || (
              <IconClock size={20} className="text-gray-400" />
            );
            return (
              <div key={idx} className="flex items-start space-x-4">
                {/* Timeline Icon */}
                <div className="relative flex flex-col items-center">
                  <div className="z-10 bg-white border-2 border-gray-300 rounded-full p-2">
                    {Icon}
                  </div>
                  {idx !== activities.length - 1 && (
                    <div className="w-px bg-gray-300 flex-1 mt-1" />
                  )}
                </div>

                {/* Content */}
                <CustomCard className="flex-1">
                  <div className="flex text-black justify-between items-center mb-1">
                    <p className="text-sm font-bold font-mono">
                      {new Date(activity.createdAt).toLocaleString()}
                    </p>
                    <span className="text-sm font-semibold text-gray-700">
                      {activity.description}
                    </span>
                  </div>
                  <div>{renderDetails(activity)}</div>
                </CustomCard>
              </div>
            );
          })}
        </div>
      </div>

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
      {/* View File Modal */}
      {fileView && (
        <ViewFile
          docu={fileView}
          setFileView={setFileView}
          handleViewClose={() => setFileView(null)}
        />
      )}
    </>
  );
};

export default Timeline;
