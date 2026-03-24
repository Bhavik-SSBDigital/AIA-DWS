import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import DocViewer, { DocViewerRenderers } from '@cyntler/react-doc-viewer';
import '@cyntler/react-doc-viewer/dist/index.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import * as XLSX from 'xlsx';
import PdfContainer from './pdfViewer';
import Editor from './Editor';
import './View.css';
import {
  IconSquareRoundedX,
  IconArrowLeft,
  IconArrowRight,
  IconPencil,
} from '@tabler/icons-react';
import CustomModal from '../../CustomComponents/CustomModal';

// Supported file types for the viewer
const SUPPORTED_TYPES = [
  'bmp',
  'csv',
  'odt',
  'doc',
  'docx',
  'gif',
  'htm',
  'html',
  'jpg',
  'jpeg',
  'pdf',
  'png',
  'ppt',
  'pptx',
  'tiff',
  'txt',
  'xls',
  'xlsx',
  'mp4',
  'webp',
  'dwg',
];

// File types that support editing
const EDITABLE_TYPES = [
  'docx',
  'doc',
  'odt',
  'xlsx',
  'xls',
  'ods',
  'pptx',
  'ppt',
  'odp',
  'odg',
  'tiff',
];

const PdfViewer = ({
  docu,
  handleViewClose,
  workflow,
  maxReceiverStepNumber,
  processId,
  currentStep,
  controls,
  setFileView,
  signedDocument, 
}) => {
  const [excelData, setExcelData] = useState([]);
  const [activeDocument, setActiveDocument] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(docu?.isEditing);
  const accessToken = sessionStorage.getItem('accessToken') || '';

  const documents = docu?.multi ? docu.docs : [docu];
  const currentDoc = documents[currentIndex];

  useEffect(() => {
    if (!currentDoc) {
      toast.warn('No document provided');
      handleViewClose();
      return;
    }

    if (!SUPPORTED_TYPES.includes(currentDoc?.type)) {
      toast.warn('Unsupported file type');
      handleViewClose();
      return;
    }
  }, [currentDoc, handleViewClose, isEditing]);

  const handleNext = () => {
    if (currentIndex < documents.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setIsEditing(false);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      setIsEditing(false);
    }
  };

  const handleDocumentChange = (document) => {
    setActiveDocument(document);
  };

  const toggleEditMode = () => {
    if (EDITABLE_TYPES.includes(currentDoc.type)) {
      setIsEditing((prev) => !prev);
      setFileView((prev) => ({ ...prev, isEditing: !prev.isEditing }));
    } else {
      toast.warn('Editing not supported for this file type');
    }
  };

  const handleEditorError = (err) => {
    console.error('Editor error:', err);
    setIsEditing(false);
    setFileView((prev) => ({ ...prev, isEditing: false }));
    toast.error(`Editor failed: ${err.message}`);
  };

  const renderExcelTable = () => {
    if (!excelData.length) {
      return <div>Loading Excel data...</div>;
    }

    return (
      <div className="overflow-x-auto max-h-[60vh]">
        <table className="min-w-full border-collapse border border-gray-300">
          <tbody>
            {excelData.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className="border border-gray-300 px-2 py-1 text-sm"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // ✅ CORS FIX: Fallback URL Appender
  // Injects the token directly into the URL to bypass strict CORS OPTIONS preflight failures
  const getAuthenticatedUrl = (url) => {
    if (!url) return url;
    // Prevent appending multiple times on re-renders
    if (url.includes('token=')) return url;
    
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}token=${accessToken}`;
  };

  return (
    <CustomModal
      isOpen={!!docu}
      onClose={handleViewClose}
      className="max-h-[90vh] overflow-auto"
      size={'full'}
    >
      <div className="sticky top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2 bg-white border rounded-t-lg">
        <div className="flex items-center gap-2">
          {documents.length > 1 && (
            <>
              <button
                onClick={handlePrevious}
                disabled={currentIndex === 0}
                className={`p-1 rounded-full transition ${
                  currentIndex === 0
                    ? 'opacity-30 cursor-not-allowed'
                    : 'hover:bg-gray-200'
                }`}
                title="Previous Document"
              >
                <IconArrowLeft size={22} />
              </button>
              <button
                onClick={handleNext}
                disabled={currentIndex === documents.length - 1}
                className={`p-1 rounded-full transition ${
                  currentIndex === documents.length - 1
                    ? 'opacity-30 cursor-not-allowed'
                    : 'hover:bg-gray-200'
                }`}
                title="Next Document"
              >
                <IconArrowRight size={22} />
              </button>
            </>
          )}
          <span className="text-sm font-medium text-gray-700 truncate max-w-[250px]">
            {currentDoc?.name ||
              currentDoc?.fileName ||
              currentDoc?.url?.split('/')?.pop()}
          </span>
          {documents.length > 1 && (
            <span className="text-xs text-gray-500 ml-2">
              ({currentIndex + 1} of {documents.length})
            </span>
          )}
        </div>
        <button
          onClick={handleViewClose}
          className="hover:bg-gray-200 p-1 rounded-full transition"
          title="Close Viewer"
        >
          <IconSquareRoundedX size={22} />
        </button>
      </div>

      {currentDoc ? (
        EDITABLE_TYPES.includes(currentDoc.type) ? (
          <Editor
            documentId={currentDoc.fileId}
            fileType={currentDoc.type}
            name={currentDoc.name}
            path={currentDoc.department?.path || currentDoc.path}
            accessToken={accessToken}
            onError={handleEditorError}
            readOnly={!isEditing}
          />
        ) : currentDoc.type === 'pdf' ? (
          <PdfContainer
            // ✅ Fix: Pass authenticated URL
            url={getAuthenticatedUrl(currentDoc.url)}
            documentId={currentDoc.fileId}
            workflow={workflow}
            maxReceiverStepNumber={maxReceiverStepNumber}
            processId={processId}
            currentStep={currentDoc.step}
            controls={controls}
            signed={signedDocument}
          />
        ) : (
          <DocViewer
            // ✅ Fix: Pass authenticated URL to DocViewer components to fix Images/Videos
            documents={[{ uri: getAuthenticatedUrl(currentDoc.url) }]}
            activeDocument={activeDocument}
            className="my-doc-viewer-style"
            pluginRenderers={DocViewerRenderers}
            onDocumentChange={handleDocumentChange}
            prefetchMethod="GET"
            style={{
              display: 'flex',
              height: '100%',
              width: '100%',
              padding: '1rem',
            }}
            signed={signedDocument}
          />
        )
      ) : (
        <div className="text-center text-gray-500">Loading document...</div>
      )}
    </CustomModal>
  );
};

export default PdfViewer;