'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';

import {
  IconZoomIn,
  IconZoomOut,
  IconRotate,
  IconRefresh,
  IconX,
} from '@tabler/icons-react';

import { toast } from 'react-toastify';
import CustomCard from '../../CustomComponents/CustomCard';

// Setup PDF worker
pdfjs.GlobalWorkerOptions.workerSrc = '/worker.js';

export default function PdfContainer({ url, contentHigh, refPage, onClose }) {
  const [numPages, setNumPages] = useState(null);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  
  // Track the currently visible page for UX anchoring
  const [visiblePage, setVisiblePage] = useState(refPage || 1);

  const pageRefs = useRef([]);
  const renderedPages = useRef(new Set());
  const scrollContainerRef = useRef(null);
  const observerRef = useRef(null);
  const initialScrollDone = useRef(false);

  const targetPage = refPage - 1 || 1;

  /* ---------------- INTERSECTION OBSERVER (Tracks active page) ---------------- */
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        let maxRatio = 0;
        let activePage = visiblePage;

        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            const pageIndex = parseInt(entry.target.getAttribute('data-page-index'), 10);
            if (!isNaN(pageIndex)) activePage = pageIndex;
          }
        });

        if (maxRatio > 0) {
          setVisiblePage(activePage);
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '0px',
        threshold: [0.1, 0.5, 0.9], // Check at multiple visibility depths
      }
    );

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, []); // Run once on mount

  /* ---------------- PDF LOAD & RENDER ---------------- */
  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  const handleRenderSuccess = (pageNumber) => {
    renderedPages.current.add(pageNumber);

    const el = pageRefs.current[pageNumber - 1];
    if (el) {
      el.setAttribute('data-page-index', pageNumber);
      observerRef.current?.observe(el); // Start tracking this page
    }

    // Initial load jump to target page
    if (pageNumber === targetPage && !initialScrollDone.current) {
      const container = scrollContainerRef.current;
      if (container && el) {
        container.scrollTo({ top: el.offsetTop - 20, behavior: 'smooth' });
      }
      initialScrollDone.current = true;
    }
  };

  /* ---------------- ZOOM & ROTATE WITH SCROLL ANCHORING ---------------- */
  const maintainScrollPosition = (action) => {
    action(); // Update the zoom/rotate state
    
    // Wait a brief moment for the React-PDF canvas to resize, then snap scroll back to the active page
    setTimeout(() => {
      const el = pageRefs.current[visiblePage - 1];
      const container = scrollContainerRef.current;
      if (el && container) {
        container.scrollTo({ top: el.offsetTop - 20, behavior: 'auto' });
      }
    }, 100); 
  };

  const zoomIn = () => maintainScrollPosition(() => setScale((s) => Math.min(s + 0.2, 3)));
  const zoomOut = () => maintainScrollPosition(() => setScale((s) => Math.max(s - 0.2, 0.5)));
  const resetZoom = () => maintainScrollPosition(() => setScale(1));
  const rotateRight = () => maintainScrollPosition(() => setRotation((r) => (r + 90) % 360));
  const resetRotation = () => maintainScrollPosition(() => setRotation(0));

  /* ---------------- HIGHLIGHT LOGIC ---------------- */
  const escapeRegex = (text = '') => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const highlightMatches = () => {
    const spans = document.querySelectorAll('.react-pdf__Page__textContent span');
    if (!contentHigh) return;

    const safeContent = escapeRegex(contentHigh);
    spans.forEach((span) => {
      const text = span.textContent || '';
      span.innerHTML = text;

      if (contentHigh) {
        const regex = new RegExp(`(${safeContent})`, 'gi');
        if (regex.test(text)) {
          span.innerHTML = text.replace(regex, `<mark class="pdf-content">$1</mark>`);
        }
      }
    });
  };

  useEffect(() => {
    const t = setTimeout(highlightMatches, 300);
    return () => clearTimeout(t);
  }, [numPages, scale, rotation, contentHigh]);

  /* ---------------- RENDER ---------------- */
  const iconBtnClass =
    'p-2 text-gray-700 hover:bg-gray-200 rounded-md transition-colors flex items-center justify-center shrink-0';

  return (
    // Fixed height layout ensures the toolbar is immune to scrolling
    <CustomCard className="p-0 flex flex-col h-[85vh] overflow-hidden bg-white relative shadow-lg">
      
      {/* 1. STRICTLY STATIC TOOLBAR */}
      <div className="flex-none w-full bg-white border-b border-gray-200 flex items-center justify-between px-3 py-2 min-h-[60px] z-50">
        
        {/* Left Side: Page Indicator */}
        <div className="flex-1 min-w-0 flex items-center pl-2">
           <span className="text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
             Page {visiblePage} {numPages ? `of ${numPages}` : ''}
           </span>
        </div>

        {/* Middle: Controls */}
        <div className="flex items-center justify-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar px-2 shrink-0">
          <button type="button" onClick={zoomOut} className={iconBtnClass} title="Zoom Out">
            <IconZoomOut size={18} />
          </button>
          <h3 className="text-sm font-medium w-12 text-center text-gray-700 shrink-0">
            {Math.round(scale * 100)}%
          </h3>
          <button type="button" onClick={zoomIn} className={iconBtnClass} title="Zoom In">
            <IconZoomIn size={18} />
          </button>
          <button type="button" onClick={resetZoom} className={iconBtnClass} title="Reset Zoom">
            <IconRefresh size={18} />
          </button>

          <div className="w-px h-5 bg-gray-300 mx-1 sm:mx-2 shrink-0"></div>

          <button type="button" onClick={rotateRight} className={iconBtnClass} title="Rotate 90°">
            <IconRotate size={18} />
          </button>
          <button type="button" onClick={resetRotation} className={iconBtnClass} title="Reset Rotation">
            <IconRefresh size={18} />
          </button>
        </div>

        {/* Right Side: Close Button */}
        <div className="flex-1 flex justify-end min-w-0 pr-1">
          {onClose && (
            <div className="border-l border-gray-200 pl-3 ml-2">
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-md transition-colors flex items-center justify-center shrink-0"
                title="Close"
              >
                <IconX size={20} strokeWidth={2.5} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. INDEPENDENTLY SCROLLING PDF CONTAINER */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 bg-gray-100 py-6 overflow-y-auto relative"
      >
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={(e) => {
            console.error(e);
            toast.error('Failed to load PDF');
          }}
          loading={
            <div className="flex justify-center items-center h-[50vh]">
              <div className="animate-spin rounded-full border-t-4 border-blue-500 w-10 h-10"></div>
            </div>
          }
        >
          {Array.from({ length: numPages || 0 }, (_, i) => (
            <div
              key={i}
              ref={(el) => (pageRefs.current[i] = el)}
              className="mb-8 flex justify-center shadow-md bg-white w-fit mx-auto transition-all duration-200 relative"
            >
              <Page
                pageNumber={i + 1}
                scale={scale}
                rotate={rotation}
                renderTextLayer
                renderAnnotationLayer={false}
                onRenderSuccess={() => handleRenderSuccess(i + 1)}
              />
            </div>
          ))}
        </Document>
      </div>

      {/* HIGHLIGHT STYLES */}
      <style>
        {`
          mark.pdf-content {
            background: rgba(0, 140, 255, 0.45);
            padding: 0;
          }
        `}
      </style>
    </CustomCard>
  );
}