import React, { useState, useRef } from 'react';
import CustomButton from './CustomButton';
import {
  GenerateDocumentName,
  uploadDocumentInProcess,
  uploadDocumentsInProcessFinal,
} from '../common/Apis';
import { toast } from 'react-toastify';
import TopLoader from '../common/Loader/TopLoader';

export default function ProcessDocumentUpload({
  processId,
  workflowId,
  issueNo,
  onFinish,
}) {
  const [documents, setDocuments] = useState([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  // Form fields for document metadata
  const [description, setDescription] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [docIssueNo, setDocIssueNo] = useState('');

  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const inputRef = useRef(null);

  // ---------------- TAG ADD ----------------
  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  // ---------------- ADD DOCUMENT ----------------
  const handleAddDocument = async () => {
    if (actionsLoading) return;

    if (!selectedFile) {
      toast.info('Select file first');
      return;
    }

    if (!description.trim()) {
      toast.info('Enter description');
      return;
    }

    setActionsLoading(true);

    // 1. Generate file name
    let generatedName;
    try {
      const ext = selectedFile.name.split('.').pop();
      const response = await GenerateDocumentName(workflowId, null, ext);
      generatedName = response?.data?.documentName;
    } catch (err) {
      setActionsLoading(false);
      toast.error(err?.response?.data?.message || 'Name generation failed');
      return;
    }

    // 2. Upload File
    let uploadRes;
    try {
      uploadRes = await uploadDocumentInProcess(
        [selectedFile],
        generatedName,
        tags,
      );
      toast.success('Document Added');
    } catch (err) {
      setActionsLoading(false);
      toast.error(err?.response?.data?.message || 'Upload failed');
      return;
    }

    // 3. Push to documents list
    const newDoc = {
      documentId: uploadRes[0], // only ID stored
      name: generatedName,
      tags,
      description,
      partNumber,
      issueNo: docIssueNo,
    };

    setDocuments((prev) => [...prev, newDoc]);

    // Reset Input Fields
    setSelectedFile(null);
    setTags([]);
    setDescription('');
    setPartNumber('');
    setDocIssueNo('');

    if (inputRef.current) inputRef.current.value = null;

    setActionsLoading(false);
  };

  // ---------------- FINAL SUBMIT ----------------
  const handleSubmit = async () => {
    if (actionsLoading) return;

    setActionsLoading(true);

    const payload = {
      processId,
      issueNo,
      documents,
    };

    try {
      const res = await uploadDocumentsInProcessFinal(payload);
      toast.success(res?.data?.message);
      onFinish(res.data);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Final submit failed');
    }

    setActionsLoading(false);
  };

  return (
    <div>
      {actionsLoading ? <TopLoader /> : null}

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Upload Documents</h2>
      </div>

      <div className="space-y-4">
        {/* FILE INPUT */}
        <input
          type="file"
          ref={inputRef}
          disabled={actionsLoading}
          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
        />

        {/* DESCRIPTION */}
        <input
          value={description}
          disabled={actionsLoading}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter Description"
          className="border p-2 rounded w-full"
        />

        {/* PART NUMBER */}
        <input
          value={partNumber}
          disabled={actionsLoading}
          onChange={(e) => setPartNumber(e.target.value)}
          placeholder="Enter Part Number"
          className="border p-2 rounded w-full"
        />

        {/* ISSUE NO */}
        <input
          value={docIssueNo}
          disabled={actionsLoading}
          onChange={(e) => setDocIssueNo(e.target.value)}
          placeholder="Enter Issue No"
          className="border p-2 rounded w-full"
        />

        {/* TAGS */}
        <div>
          <div className="flex gap-2">
            <input
              value={newTag}
              disabled={actionsLoading}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Add Tag"
              className="border p-2 rounded"
            />
            <CustomButton
              click={addTag}
              disabled={actionsLoading}
              text={'Add'}
            />
          </div>

          <div className="flex gap-2 mt-2 flex-wrap">
            {tags.map((t) => (
              <span
                key={t}
                className="px-3 py-1 bg-blue-200 rounded-full text-sm"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* ADD DOCUMENT BUTTON */}
        <CustomButton
          click={handleAddDocument}
          className="w-full"
          disabled={!selectedFile || actionsLoading}
          text={actionsLoading ? 'Processing...' : 'Add Document'}
        />

        {/* DOCUMENTS LIST */}
        <div className="max-h-40 overflow-y-auto mt-3 border p-3 rounded-xl">
          {documents.length === 0 ? (
            <p className="text-gray-400 text-sm text-center">
              No documents added yet
            </p>
          ) : (
            documents.map((doc, idx) => (
              <div key={idx} className="p-2 border-b space-y-1 text-sm">
                <p>
                  <strong>Name:</strong> {doc.name}
                </p>
                <p>
                  <strong>Description:</strong> {doc.description}
                </p>
                <p>
                  <strong>Part:</strong> {doc.partNumber}
                </p>
                <p>
                  <strong>Issue No:</strong> {doc.issueNo}
                </p>
                <p>
                  <strong>Tags:</strong> {doc.tags.join(', ')}
                </p>
              </div>
            ))
          )}
        </div>

        {/* FINAL SUBMIT */}
        <CustomButton
          click={handleSubmit}
          className="w-full mt-4"
          disabled={documents.length === 0 || actionsLoading}
          text={actionsLoading ? 'Submitting...' : 'Finish & Submit'}
        />
      </div>
    </div>
  );
}
