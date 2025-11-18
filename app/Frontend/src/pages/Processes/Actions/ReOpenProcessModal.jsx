import React, { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import {
  uploadDocumentInProcess,
  ReOpenProcess,
  GenerateDocumentName,
} from '../../../common/Apis';
import { toast } from 'react-toastify';
import CustomButton from '../../../CustomComponents/CustomButton';
import { IconSquarePlus, IconSquareX } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';

export default function ReOpenProcessModal({
  workflowId,
  processId,
  documents = [],
  close,
  storagePath,
}) {
  const {
    control,
    handleSubmit,
    register,
    getValues,
    setValue,
    reset,
    watch,
    formState: { isSubmitting },
  } = useForm({
    defaultValues: {
      processId,
      issueNo: '',
      supersededDocuments: [
        {
          oldDocumentId: '',
          newDocumentId: '',
          uploadedFileName: '',
          reasonOfSupersed: '',
          issueNo: '',
          partNumber: '',
          fileDescription: '',
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'supersededDocuments',
  });
  const navigate = useNavigate();
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState();

  const handleUpload = async (file, index, replacedDocId) => {
    if (!file) return;

    try {
      // Optional: generate custom name
      const generatedName = await GenerateDocumentName(
        workflowId,
        replacedDocId,
        file.name.split('.').pop(),
      );

      // Upload the document (with or without name)
      const response = await uploadDocumentInProcess(
        [file],
        generatedName?.data?.documentName,
        [],
        storagePath,
      );

      if (!response || !response.length || !response[0]) {
        throw new Error('Document upload failed or returned no ID');
      }

      const uploadedId = response[0];

      // Update local form state
      const updated = [...getValues('supersededDocuments')];
      updated[index].newDocumentId = uploadedId;
      updated[index].uploadedFileName = generatedName?.data?.documentName;
      // updated[index].generatedName = generatedName; // Optional: store generated name if needed

      reset((prev) => ({
        ...prev,
        supersededDocuments: updated,
      }));

      toast.success('Document uploaded successfully');
    } catch (err) {
      toast.error(
        err?.response?.data?.message || err.message || 'Upload failed',
      );
    }
  };

  const onSubmit = async (data) => {
    const valid = data.supersededDocuments.every(
      (item) => item.oldDocumentId && item.newDocumentId,
    );
    if (!valid) {
      toast.warning('Please select documents and upload replacements.');
      return;
    }
    try {
      const res = await ReOpenProcess({
        processId,
        issueNo: data?.issueNo,
        supersededDocuments: data.supersededDocuments.map((d) => ({
          oldDocumentId: parseInt(d.oldDocumentId, 10),
          newDocumentId: d.newDocumentId,
          reasonOfSupersed: d.reasonOfSupersed,
          issueNo: d.issueNo,
          partNumber: d.partNumber,
          fileDescription: d.fileDescription,
          tags: tags,
        })),
      });

      toast.success(res?.data?.message || 'Process reopened');
      navigate('/processes/completed');
      close();
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-800">Reopen Process</h2>

      <div>
        <label className="block text-sm font-medium mb-1">
          Enter SOP Issue/Revision Number
        </label>
        <input
          type="text"
          {...register(`issueNo`)}
          className="w-full border p-2 rounded text-sm"
          placeholder="Enter"
        />
      </div>
      {fields.map((field, index) => {
        const uploadedFileName = watch(
          `supersededDocuments.${index}.uploadedFileName`,
        );
        const selectedId = watch(`supersededDocuments.${index}.oldDocumentId`);

        return (
          <div
            key={field.id}
            className="p-4 border bg-gray-50 rounded-md shadow-sm space-y-3 relative"
          >
            {index !== 0 ? (
              <button
                type="button"
                onClick={() => remove(index)}
                className="absolute top-1 right-1 text-red-500"
                title="Remove"
              >
                <IconSquareX size={20} />
              </button>
            ) : null}

            <div>
              <label className="block text-sm font-medium mb-1">
                Select Document to Replace
              </label>
              <select
                {...register(`supersededDocuments.${index}.oldDocumentId`)}
                required
                className="w-full border p-2 rounded text-sm"
                onChange={(e) => {
                  const value = e.target.value;

                  // RHF update
                  register(
                    `supersededDocuments.${index}.oldDocumentId`,
                  ).onChange(e);
                  setValue(`supersededDocuments.${index}.oldDocumentId`, value);

                  // find selected document
                  const selectedDoc = documents.find(
                    (doc) => String(doc.id) === value,
                  );

                  // 🔥 update tags (ONLY this is added)
                  if (selectedDoc?.tags) {
                    setTags(selectedDoc.tags);
                  }
                }}
              >
                <option value="">-- Select Document --</option>
                {documents
                  .filter(
                    (doc) =>
                      !getValues('supersededDocuments')
                        ?.map((item, i) =>
                          i !== index ? item.oldDocumentId : null,
                        )
                        .includes(String(doc.id)),
                  )
                  .map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Upload Replacement Document
              </label>
              <input
                type="file"
                className="w-full border p-2 rounded text-sm"
                onChange={(e) =>
                  handleUpload(e.target.files[0], index, selectedId)
                }
              />
              {uploadedFileName && (
                <p className="text-sm text-green-600 mt-1">
                  Uploaded: {uploadedFileName}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Reason for Superseding
              </label>
              <input
                type="text"
                {...register(`supersededDocuments.${index}.reasonOfSupersed`)}
                className="w-full border p-2 rounded text-sm"
                placeholder="Enter reason"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Document Description
              </label>
              <input
                type="text"
                {...register(`supersededDocuments.${index}.partNumber`)}
                className="w-full border p-2 rounded text-sm"
                placeholder="Enter Description"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Part Number
              </label>
              <input
                type="text"
                {...register(`supersededDocuments.${index}.fileDescription`)}
                className="w-full border p-2 rounded text-sm"
                placeholder="Enter Part Number"
              />
            </div>
            {/* Tag Input */}
            <div className="mt-4">
              <label className="text-sm font-medium text-gray-700">Tags</label>
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => {
                    const sanitizedValue = e.target.value.replace(
                      /[^a-zA-Z0-9 ]/g,
                      '',
                    );
                    setNewTag(sanitizedValue);
                  }}
                  className="border border-gray-300 p-2 rounded-md w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter tag..."
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newTag.trim()) {
                      setTags((prev) => [...prev, newTag.trim()]);
                      setNewTag('');
                    }
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition"
                >
                  Add
                </button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {tags.map((tag, index) => (
                    <span
                      key={index}
                      className="bg-purple-600 text-white px-3 py-1 text-sm rounded-full flex items-center gap-1 cursor-pointer hover:bg-purple-700 transition"
                      onClick={() =>
                        setTags((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      {tag} <span className="text-lg">&times;</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Enter Document Issue No/Revision No
              </label>
              <input
                type="text"
                {...register(`supersededDocuments.${index}.issueNo`)}
                className="w-full border p-2 rounded text-sm"
                placeholder="Enter"
              />
            </div>

            <input
              type="hidden"
              {...register(`supersededDocuments.${index}.newDocumentId`)}
            />
            <input
              type="hidden"
              {...register(`supersededDocuments.${index}.uploadedFileName`)}
            />
          </div>
        );
      })}

      <CustomButton
        type="button"
        variant="secondary"
        click={() =>
          append({
            oldDocumentId: '',
            newDocumentId: '',
            uploadedFileName: '',
            reasonOfSupersed: '',
            partNumber: '',
            fileDescription: '',
          })
        }
        className={'mx-auto block'}
        text={
          <div className="flex items-center gap-2">
            <IconSquarePlus size={18} />
            Add Document to Replace
          </div>
        }
      />

      <div className="flex justify-end gap-2 pt-4">
        <CustomButton
          type="button"
          variant="danger"
          text="Cancel"
          click={close}
          disabled={isSubmitting}
        />
        <CustomButton
          type="submit"
          text="Reopen Process"
          disabled={isSubmitting}
        />
      </div>
    </form>
  );
}
