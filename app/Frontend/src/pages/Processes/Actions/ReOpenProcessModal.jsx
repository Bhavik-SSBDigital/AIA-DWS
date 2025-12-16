import React, { useRef, useState } from 'react';
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
  const navigate = useNavigate();
  const fileInputRefs = useRef({});

  const {
    control,
    handleSubmit,
    register,
    watch,
    setValue,
    getValues,
    formState: { isSubmitting },
  } = useForm({
    defaultValues: {
      processId,
      issueNo: '',
      supersededDocuments: [
        {
          isNewDocument: false,
          preApproved: false,
          oldDocumentId: '',
          newDocumentId: '',
          uploadedFileName: '',
          reasonOfSupersed: '',
          issueNo: '',
          partNumber: '',
          fileDescription: '',
          tags: [],
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'supersededDocuments',
  });

  const [newTag, setNewTag] = useState('');
  const resetFileInput = (index) => {
    if (fileInputRefs.current[index]) {
      fileInputRefs.current[index].value = '';
    }
  };

  /* ===================== UPLOAD HANDLER ===================== */
  const handleUpload = async (file, index) => {
    if (!file) return;

    const row = getValues(`supersededDocuments.${index}`);
    const extension = file.name.split('.').pop();

    try {
      let finalFileName = '';

      if (row.preApproved) {
        if (!row.uploadedFileName) {
          toast.warning('Enter filename for pre-approved document');
          resetFileInput(index); // ✅ CLEAR FILE
          return;
        }
        // Add extension if missing
        finalFileName = row.uploadedFileName.includes('.')
          ? row.uploadedFileName
          : `${row.uploadedFileName}.${extension}`;
      } else {
        const res = await GenerateDocumentName(
          workflowId,
          row.isNewDocument ? null : row.oldDocumentId,
          extension,
        );
        finalFileName = res?.data?.documentName;
        if (!finalFileName) {
          toast.error('Failed to generate document name');
          return;
        }
        setValue(
          `supersededDocuments.${index}.uploadedFileName`,
          finalFileName,
        );
      }

      const uploadRes = await uploadDocumentInProcess(
        [file],
        finalFileName,
        [],
        storagePath,
      );

      setValue(`supersededDocuments.${index}.newDocumentId`, uploadRes[0]);
      setValue(`supersededDocuments.${index}.uploadedFileName`, finalFileName);

      toast.success('Document uploaded successfully');
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    }
  };

  /* ===================== SUBMIT ===================== */
  const onSubmit = async (data) => {
    const valid = data.supersededDocuments.every((d) => {
      return (
        d.uploadedFileName &&
        d.newDocumentId &&
        (d.isNewDocument || d.oldDocumentId)
      );
    });

    if (!valid) {
      toast.warning(
        'Please fill all required fields and upload all documents.',
      );
      return;
    }

    await ReOpenProcess({
      processId,
      issueNo: data.issueNo,
      supersededDocuments: data.supersededDocuments.map((d) => ({
        isNewDocument: d.isNewDocument,
        preApproved: d.preApproved, // ✅ include preApproved
        oldDocumentId: d.isNewDocument ? null : Number(d.oldDocumentId),
        newDocumentId: d.newDocumentId,
        reasonOfSupersed: d.reasonOfSupersed,
        issueNo: d.issueNo,
        partNumber: d.partNumber,
        fileDescription: d.fileDescription,
        tags: d.tags,
        uploadedFileName: d.uploadedFileName,
      })),
    });

    toast.success('Process reopened');
    navigate('/processes/completed');
    close();
  };

  /* ===================== UI ===================== */
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-lg font-semibold">Reopen Process</h2>

      <input
        {...register('issueNo', {
          required: 'SOP Issue/Revision No is required',
        })}
        placeholder="SOP Issue / Revision No"
        className="w-full border p-2 rounded"
      />

      {fields.map((field, index) => {
        const isNew = watch(`supersededDocuments.${index}.isNewDocument`);
        const preApproved = watch(`supersededDocuments.${index}.preApproved`);
        const uploaded = watch(`supersededDocuments.${index}.uploadedFileName`);
        const tags = watch(`supersededDocuments.${index}.tags`) || [];

        return (
          <div key={field.id} className="border p-4 rounded relative space-y-3">
            {index > 0 && (
              <button
                type="button"
                onClick={() => remove(index)}
                className="absolute top-2 right-2 text-red-500"
              >
                <IconSquareX />
              </button>
            )}

            {/* NEW DOCUMENT */}
            <label className="flex gap-2 items-center">
              <input
                type="checkbox"
                {...register(`supersededDocuments.${index}.isNewDocument`)}
                onChange={(e) => {
                  setValue(
                    `supersededDocuments.${index}.isNewDocument`,
                    e.target.checked,
                  );
                  if (e.target.checked) {
                    setValue(`supersededDocuments.${index}.oldDocumentId`, '');
                  }
                }}
              />
              New document (not replacement)
            </label>

            {/* PRE-APPROVED */}
            <label className="flex gap-2 items-center">
              <input
                type="checkbox"
                {...register(`supersededDocuments.${index}.preApproved`)}
              />
              Pre-approved document
            </label>

            {/* OLD DOCUMENT SELECT */}
            {!isNew && (
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Select Document to Replace
                </label>
                <select
                  {...register(`supersededDocuments.${index}.oldDocumentId`, {
                    required: !isNew && 'Select document to replace',
                  })}
                  className="w-full border p-2 rounded"
                >
                  <option value="">Select document</option>
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* FILE NAME FOR PRE-APPROVED */}
            {preApproved && (
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Enter File Name (without extension)
                </label>
                <input
                  {...register(
                    `supersededDocuments.${index}.uploadedFileName`,
                    {
                      required:
                        preApproved &&
                        'Filename is required for pre-approved document',
                    },
                  )}
                  className="w-full border p-2 rounded"
                  placeholder="Enter file name"
                />
              </div>
            )}

            {/* FILE UPLOAD */}
            <div>
              <label className="text-sm font-medium mb-1 block">
                Upload Document
              </label>
              <input
                type="file"
                ref={(el) => (fileInputRefs.current[index] = el)}
                onChange={(e) => handleUpload(e.target.files[0], index)}
              />
              {uploaded && (
                <p className="text-green-600 text-sm mt-1">
                  Uploaded: {uploaded}
                </p>
              )}
            </div>

            {/* REASON */}
            <div>
              <label className="text-sm font-medium mb-1 block">
                Reason for Superseding
              </label>
              <input
                {...register(`supersededDocuments.${index}.reasonOfSupersed`, {
                  required: 'Reason is required',
                })}
                className="w-full border p-2 rounded"
                placeholder="Enter reason"
              />
            </div>

            {/* DOCUMENT DESCRIPTION */}
            <div>
              <label className="text-sm font-medium mb-1 block">
                Document Description
              </label>
              <input
                {...register(`supersededDocuments.${index}.partNumber`, {
                  required: 'Description is required',
                })}
                className="w-full border p-2 rounded"
                placeholder="Enter description"
              />
            </div>

            {/* PART NUMBER */}
            <div>
              <label className="text-sm font-medium mb-1 block">
                Part Number
              </label>
              <input
                {...register(`supersededDocuments.${index}.fileDescription`, {
                  required: 'Part Number is required',
                })}
                className="w-full border p-2 rounded"
                placeholder="Enter part number"
              />
            </div>

            {/* DOCUMENT ISSUE / REVISION */}
            <div>
              <label className="text-sm font-medium mb-1 block">
                Document Issue / Revision No
              </label>
              <input
                {...register(`supersededDocuments.${index}.issueNo`, {
                  required: 'Issue/Revision no is required',
                })}
                className="w-full border p-2 rounded"
                placeholder="Enter issue / revision"
              />
            </div>

            {/* TAGS */}
            <div>
              <label className="text-sm font-medium block">Tags</label>
              <div className="flex gap-2 mt-2">
                <input
                  value={newTag}
                  onChange={(e) =>
                    setNewTag(e.target.value.replace(/[^a-zA-Z0-9 ]/g, ''))
                  }
                  placeholder="Enter tag"
                  className="border p-2 rounded w-full"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newTag) {
                      setValue(`supersededDocuments.${index}.tags`, [
                        ...tags,
                        newTag,
                      ]);
                      setNewTag('');
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded"
                >
                  Add
                </button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {tags.map((t, i) => (
                    <span
                      key={i}
                      onClick={() =>
                        setValue(
                          `supersededDocuments.${index}.tags`,
                          tags.filter((_, x) => x !== i),
                        )
                      }
                      className="bg-purple-600 text-white px-3 py-1 rounded cursor-pointer"
                    >
                      {t} ×
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* HIDDEN FIELDS */}
            <input
              type="hidden"
              {...register(`supersededDocuments.${index}.newDocumentId`)}
            />
          </div>
        );
      })}

      <CustomButton
        type="button"
        click={() =>
          append({
            isNewDocument: false,
            preApproved: false,
            oldDocumentId: '',
            newDocumentId: '',
            uploadedFileName: '',
            reasonOfSupersed: '',
            issueNo: '',
            partNumber: '',
            fileDescription: '',
            tags: [],
          })
        }
        text={
          <div className="flex gap-2 items-center">
            <IconSquarePlus /> Add Document
          </div>
        }
      />

      <div className="flex justify-end gap-2">
        <CustomButton
          type="button"
          variant="danger"
          click={close}
          text={'Cancel'}
        />
        <CustomButton type="submit" disabled={isSubmitting} text={'Submit'} />
      </div>
    </form>
  );
}
