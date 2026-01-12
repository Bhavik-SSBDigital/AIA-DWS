import { useState } from 'react';
import {
  IconUpload,
  IconFileText,
  IconDownload,
  IconLoader2,
  IconAlertCircle,
  IconX,
} from '@tabler/icons-react';
import apiClient from '../../common/Apis';
import CustomButton from '../../CustomComponents/CustomButton';
import CustomModal from '../../CustomComponents/CustomModal';

export default function MergePdfComponent() {
  const [files, setFiles] = useState([]);
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);

  /** accept all file types supported by backend */
  const handleFiles = (selectedFiles) => {
    const unique = selectedFiles.filter(
      (f) => !files.some((x) => x.name === f.name && x.size === f.size),
    );

    setFiles((prev) => [...prev, ...unique]);
    setError(null);
  };

  const handleFileSelect = (e) => {
    handleFiles(Array.from(e.target.files));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    handleFiles(Array.from(e.dataTransfer.files));
  };

  const removeFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleMerge = async () => {
    if (files.length === 0) {
      setError('Please select at least one file');
      return;
    }

    setIsMerging(true);
    setError(null);
    setPdfBlobUrl(null);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));

      const response = await apiClient.post('/merge-pdf', formData, {
        responseType: 'blob',
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });

      const blob = new Blob([response.data], {
        type: 'application/pdf',
      });

      const url = URL.createObjectURL(blob);
      setPdfBlobUrl(url);
    } catch (err) {
      setError(
        err.response?.data?.message || err.message || 'Failed to merge files',
      );
    } finally {
      setIsMerging(false);
    }
  };

  const handleDirectDownload = () => {
    if (!pdfBlobUrl) return;

    const a = document.createElement('a');
    a.href = pdfBlobUrl;
    a.download = 'merged_documents.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-10">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold">Merge Files to PDF</h1>
          <p className="text-gray-500 mt-2">
            PDFs, images, and documents supported
          </p>
        </div>

        {/* Upload Area */}
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`
            block border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer
            transition-all
            ${
              dragActive
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-300 hover:border-indigo-400'
            }
          `}
        >
          <IconUpload size={44} className="mx-auto text-gray-400 mb-4" />
          <p className="font-medium text-gray-700">
            Click or drag & drop files
          </p>
          <p className="text-sm text-gray-500 mt-1">
            PDF, Images, Word, Excel, PowerPoint
          </p>

          <input
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>

        {/* Selected Files */}
        {files.length > 0 && (
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <IconFileText size={18} />
              Selected Files ({files.length})
            </h3>

            <div className="flex flex-wrap gap-3">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full text-sm"
                >
                  <span className="max-w-[200px] truncate">{file.name}</span>
                  <span className="text-gray-500">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                  <button onClick={() => removeFile(index)}>
                    <IconX size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-center gap-4">
          <button
            onClick={handleMerge}
            disabled={isMerging || files.length === 0}
            className={`
              flex items-center gap-2 px-8 py-3 rounded-lg font-medium
              ${
                isMerging || files.length === 0
                  ? 'bg-gray-300 text-gray-500'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }
            `}
          >
            {isMerging ? (
              <>
                <IconLoader2 size={18} className="animate-spin" />
                Merging...
              </>
            ) : (
              'Merge Files'
            )}
          </button>

          {pdfBlobUrl && (
            <button
              onClick={handleDirectDownload}
              className="flex items-center gap-2 px-8 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg"
            >
              <IconDownload size={18} />
              Download PDF
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex gap-2 text-red-700">
            <IconAlertCircle size={18} />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
