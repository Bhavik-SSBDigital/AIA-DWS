import React, { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { toast } from 'react-toastify';
import { IconInfoTriangle } from '@tabler/icons-react';
import CustomModal from '../../CustomComponents/CustomModal';
import CustomButton from '../../CustomComponents/CustomButton';
import {
  getHighlightsInFile,
  getSignCoordinatesForCurrentStep,
  postHighlightInFile,
  removeCoordinates,
  storeSignCoordinates,
} from '../../common/Apis';

pdfjs.GlobalWorkerOptions.workerSrc = '/worker.js';

function PdfContainer({
  url,
  documentId,
  workflow,
  maxReceiverStepNumber,
  processId,
  currentStep,
  controls = true,
  signed,
}) {
  const username = sessionStorage.getItem('username');
  const initiator = sessionStorage.getItem('initiator') == 'true';
  const [numPages, setNumPages] = useState(null);
  const [selectedText, setSelectedText] = useState('');
  const [coordinates, setCoordinates] = useState([]);
  const [openRemarksMenu, setOpenRemarksMenu] = useState(false);
  const [remark, setRemark] = useState('');
  const [actionsLoading, setActionsLoading] = useState(false);
  const [highlights, setHighlights] = useState([]);
  const [signAreas, setSignAreas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [currentSignArea, setCurrentSignArea] = useState(null);
  const pageRefs = useRef([]);
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const token = sessionStorage.getItem('accessToken');

  const [userSignDialogOpen, setUserSignDialogOpen] = useState(false);

  useEffect(() => {
    if (mode === 'signSelection') {
      document.addEventListener('dblclick', handleMouseDown);
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('dblclick', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('dblclick', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [mode, drawing, currentSignArea]);

  useEffect(() => {
    const handleTextSelection = () => {
      if (mode !== 'textSelection') return;
      const selection = window.getSelection();
      const selectedText = selection.toString()?.trim() || '';
      if (selectedText.length > 0 && selectedText) {
        const range = selection.getRangeAt(0);
        const rects = range.getClientRects();
        const newCoordinates = [];
        let isOverlapDetected = false;

        for (const rect of rects) {
          const container = pageRefs.current.find((ref) =>
            ref.contains(range.commonAncestorContainer),
          );
          if (container) {
            const containerRect = container.getBoundingClientRect();
            const rectCoordinates = {
              page: pageRefs.current.indexOf(container) + 1,
              x: rect.left - containerRect.left,
              y: rect.top - containerRect.top,
              width: rect.width,
              height: rect.height,
            };
            const isOverlap = highlights.some((highlight) =>
              highlight.coordinates.some(
                (hCoord) =>
                  hCoord.page === rectCoordinates.page &&
                  hCoord.y < rectCoordinates.y + rectCoordinates.height &&
                  hCoord.y + hCoord.height > rectCoordinates.y &&
                  ((hCoord.x >= rectCoordinates.x &&
                    hCoord.x <= rectCoordinates.x + rectCoordinates.width) ||
                    (rectCoordinates.x >= hCoord.x &&
                      rectCoordinates.x <= hCoord.x + hCoord.width)),
              ),
            );

            if (isOverlap) {
              isOverlapDetected = true;
              break;
            } else {
              newCoordinates.push(rectCoordinates);
            }
          }
        }
        if (isOverlapDetected) {
          toast.info('Selected text overlaps with existing highlights.');
        } else if (newCoordinates.length > 0) {
          setSelectedText(selectedText);
          setCoordinates([{ remark: '', coordinates: newCoordinates }]);
          setOpenRemarksMenu(true);
        }
      }
    };

    document.addEventListener('mouseup', handleTextSelection);

    return () => {
      document.removeEventListener('mouseup', handleTextSelection);
    };
  }, [mode, highlights]);

  const handleMouseDown = (e) => {
    if (userSignDialogOpen) return;
    if (mode === 'signSelection') {
      setDrawing(true);
      const container = pageRefs.current.find((ref) => ref.contains(e.target));
      if (container) {
        const containerRect = container.getBoundingClientRect();
        setCurrentSignArea({
          page: pageRefs.current.indexOf(container) + 1,
          x: e.clientX - containerRect.left,
          y: e.clientY - containerRect.top,
          width: 0,
          height: 0,
        });
      }
    }
  };

  const handleMouseMove = (e) => {
    if (mode === 'signSelection' && drawing && currentSignArea) {
      const container = pageRefs.current[currentSignArea.page - 1];
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const width = Math.max(
          0,
          e.clientX - containerRect.left - currentSignArea.x,
        );
        const height = Math.max(
          0,
          e.clientY - containerRect.top - currentSignArea.y,
        );
        setCurrentSignArea({
          ...currentSignArea,
          width: width,
          height: height,
        });
      }
    }
  };

  const handleMouseUp = () => {
    setDrawing(false);
    if (mode === 'signSelection' && drawing) {
      setDrawing(false);
      if (currentSignArea.width > 0 && currentSignArea.height > 0) {
        setUserSignDialogOpen(true);
      }
    }
  };

  const [userSelected, setUserSelected] = useState(null);
  const submitSignArea = async () => {
    setActionsLoading(true);
    try {
      await storeSignCoordinates({
        docId: documentId,
        processId,
        coordinates: [{ ...currentSignArea, stepNo: userSelected }],
      });
      setSignAreas((prev) => [
        ...prev,
        { ...currentSignArea, stepNo: userSelected },
      ]);
      setCurrentSignArea(null);
      setUserSignDialogOpen(false);
      setUserSelected(null);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
    }
  };

  const onSignAreaDialogClose = () => {
    setCurrentSignArea(null);
    setUserSignDialogOpen(false);
    setUserSelected(null);
  };

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setLoading(false);
  };

  const removeSignArea = async (signArea, index) => {
    try {
      const response = await removeCoordinates({
        documentId,
        coordinates: signArea,
      });
      setSignAreas((prev) => prev.filter((_, i) => i !== index));
      toast.success(response?.data?.message);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    }
  };

  const [openTooltip, setOpenTooltip] = useState(false);
  const renderPages = () => {
    const pages = [];
    for (let i = 1; i <= numPages; i++) {
      pages.push(
        <Box
          key={i}
          ref={(el) => (pageRefs.current[i - 1] = el)}
          className="pdf-page"
          position="relative"
        >
          <Page
            className={'!block !mx-auto w-fit'}
            pageNumber={i}
            renderTextLayer
          />
          {highlights.map((highlight, index1) =>
            highlight.coordinates
              .filter((coord) => coord.page === i)
              .map((coord, index2) => (
                <>
                  <Box
                    sx={{
                      display:
                        openTooltip?.x == coord?.x && openTooltip?.y == coord?.y
                          ? 'block'
                          : 'none',
                      position: 'absolute',
                      width: 'fit-content',
                      right: 10,
                      background: 'white',
                      boxShadow:
                        'rgba(6, 24, 44, 0.4) 0px 0px 0px 2px, rgba(6, 24, 44, 0.65) 0px 4px 6px -1px, rgba(255, 255, 255, 0.08) 0px 1px 0px inset',
                      padding: '2px',
                      top: coord.y + coord.height,
                      left: coord.x,
                      zIndex: 3,
                    }}
                  >
                    <Typography fontWeight={700} fontSize={14} color="black">
                      User : {highlight.createdBy}
                    </Typography>
                    <Typography fontWeight={700} fontSize={14} color="black">
                      Remarks : {highlight.remark}
                    </Typography>
                  </Box>
                  <div
                    onMouseEnter={() =>
                      setOpenTooltip({ x: coord.x, y: coord.y })
                    }
                    onMouseLeave={() => setOpenTooltip(null)}
                    style={{
                      userSelect: 'none',
                      position: 'absolute',
                      zIndex: 2,
                      top: coord.y,
                      left: coord.x,
                      width: coord.width,
                      height: coord.height,
                      backgroundColor: generateColor(index1),
                      backgroundBlendMode: 'lighten',
                      borderRadius: '2px',
                      cursor: 'pointer',
                    }}
                  />
                </>
              )),
          )}
          {mode === 'signSelection' &&
            currentSignArea &&
            currentSignArea.page === i && (
              <Box
                sx={{
                  position: 'absolute',
                  top: currentSignArea.y,
                  left: currentSignArea.x,
                  width: currentSignArea.width,
                  height: currentSignArea.height,
                  border: '2px dashed red',
                  backgroundColor: 'rgba(255, 0, 0, 0.3)',
                }}
              />
            )}

          {signAreas
            ?.filter((signArea) => signArea.page === i)
            ?.map((signArea, index) => (
              <Tooltip
                title={
                  signArea?.isSigned
                    ? signArea.signedBy
                    : workflow
                        ?.find((item) => item.step == signArea.stepNo)
                        ?.users?.map((user) => user.user)
                        .join(',')
                }
              >
                <Box
                  key={index}
                  sx={{
                    position: 'absolute',
                    top: signArea.y,
                    left: signArea.x,
                    width: signArea.width,
                    height: signArea.height,
                    border: workflow?.length ? '2px solid red' : null,
                    backgroundColor:
                      signed && workflow?.length ? '#FAD4D477' : null,
                    zIndex: 20,
                  }}
                >
                  {initiator ? (
                    <Button
                      onClick={() => removeSignArea(signArea, index)}
                      sx={{
                        position: 'absolute',
                        top: -10,
                        right: -10,
                        backgroundColor: 'white',
                        borderRadius: '50%',
                        width: '20px',
                        height: '20px',
                        minWidth: '0',
                        padding: '0',
                        border: '2px solid red',
                        zIndex: 9,
                      }}
                    >
                      X
                    </Button>
                  ) : null}
                </Box>
              </Tooltip>
            ))}
        </Box>,
      );
    }
    return pages;
  };

  function generateColor(num) {
    const hash = num * 123456789;
    const r = 200 + (((hash & 0xff0000) >> 16) % 56);
    const g = 200 + (((hash & 0x00ff00) >> 8) % 56);
    const b = 200 + ((hash & 0x0000ff) % 56);
    return `rgba(${r}, ${g}, ${b}, 0.3)`;
  }

  const [remarkError, setRemarkError] = useState('');
  
  const getFileHighlights = async () => {
    try {
      const res = await getHighlightsInFile(documentId);
      setHighlights(res.data.highlights);
    } catch (error) {
      console.log(error.message);
    }
  };

  const getSignCoordinates = async () => {
    try {
      const res = await getSignCoordinatesForCurrentStep({
        docId: documentId,
        processId: processId,
        stepNo: currentStep,
        initiator,
      });
      setSignAreas(res?.data?.coordinates);
    } catch (error) {
      console.log(error?.response?.data?.message || error?.message);
    }
  };

  useEffect(() => {
    getFileHighlights();
    getSignCoordinates();
  }, []);

  const submitRemarks = async () => {
    if (!remark) {
      setRemarkError('Enter Remarks');
      return;
    }
    setActionsLoading(true);
    const data = {
      remark,
      coordinates: coordinates[0].coordinates,
      documentId,
    };
    try {
      const res = await postHighlightInFile(data);
      toast.success(res?.data?.message || 'Remarks Submitted');
      setOpenRemarksMenu(false);
      getFileHighlights();
      setRemark('');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
    }
  };

  return (
    <div
      style={{
        userSelect: mode === 'signSelection' ? 'none' : 'auto',
      }}
    >
      {controls ? (
        <div className="bg-white sticky top-11 z-20 p-2 mb-1">
          <div className="flex justify-between">
            {false ? (
              <>
                <button
                  className={`${
                    mode === 'textSelection'
                      ? 'bg-blue-500 text-white'
                      : 'border border-gray-300 text-gray-700'
                  } p-2 rounded-md`}
                  onClick={() => setMode('textSelection')}
                >
                  Text Selection Mode
                </button>
                <button
                  className={`${
                    mode === 'signSelection'
                      ? 'bg-blue-500 text-white'
                      : 'border border-gray-300 text-gray-700'
                  } p-2 rounded-md`}
                  onClick={() => setMode('signSelection')}
                >
                  Sign Selection Mode
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <Document
        // ✅ CORS FIX: Simply pass the URL string. 
        // Because the URL already has `?token=...`, the backend will authorize it natively.
        // This stops react-pdf from injecting custom headers, allowing the browser to skip the strict OPTIONS preflight entirely.
        file={url}
        onLoadSuccess={onDocumentLoadSuccess}
        onLoadError={(error) => {
          console.error('PDF Load Error:', error);
          toast.error(`Failed to load PDF: ${error.message}`);
        }}
        loading={
          <div className="flex justify-center items-center h-[70vh]">
            <div className="animate-spin rounded-full border-t-4 border-blue-500 w-12 h-12"></div>
          </div>
        }
      >
        {renderPages()}
      </Document>

      {openRemarksMenu && (
        <CustomModal
          isOpen={openRemarksMenu}
          onClose={() => setOpenRemarksMenu(false)}
          className="w-96"
        >
          <div className="rounded-md font-semibold">Enter Remarks</div>
          <div className="flex flex-col gap-2">
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={3}
              className="w-full p-2 border border-gray-300 rounded-md resize-none"
            ></textarea>
            <CustomButton
              click={submitRemarks}
              text="Submit"
              disabled={actionsLoading}
            />
          </div>
        </CustomModal>
      )}

      {userSignDialogOpen && (
        <CustomModal
          isOpen={userSignDialogOpen}
          onClose={onSignAreaDialogClose}
        >
          <form className="bg-white rounded-lg max-w-md mx-auto space-y-4">
            <div className="text-lg font-semibold rounded-md">
              Select user you want sign of here
            </div>

            <div>
              <select
                id="userSelect"
                value={userSelected}
                onChange={(e) => setUserSelected(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-800"
              >
                {workflow
                  ?.filter(
                    (item) =>
                      !item.users.some((user) => user.user === username),
                  )
                  .filter((item) => item.step <= maxReceiverStepNumber)
                  .map((item) => (
                    <option key={item.step} value={item.step}>
                      forward to{' '}
                      {item.users.map((user) => user.user).join(', ')} for work{' '}
                      {item.work} (step - {item.step})
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex w-full">
              <CustomButton
                className="w-full"
                text="Submit"
                type="button"
                click={submitSignArea}
                disabled={actionsLoading}
              />
            </div>
          </form>
        </CustomModal>
      )}
    </div>
  );
}

export default PdfContainer;