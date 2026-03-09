import React from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import CustomButton from '../../../CustomComponents/CustomButton';
import { 
  IconSquareX, 
  IconCheck, 
  IconMessageCircleQuestion, 
  IconMessageCircle,
  IconFiles,
  IconPlus,
  IconUpload,
  IconReplace
} from '@tabler/icons-react';
import { toast } from 'react-toastify';
import {
  CreateQuery,
  GenerateDocumentName,
  uploadDocumentInProcess,
} from '../../../common/Apis';
import { useNavigate } from 'react-router-dom';

export default function QuerySolve({
  workflowId,
  processId,
  close,
  stepInstanceId,
  queryRaiserStepInstanceId,
  existingQuery,
  storagePath,
  documents,
}) {
  const {
    register,
    control,
    handleSubmit,
    getValues,
    reset,
    watch,
    formState: { isSubmitting },
  } = useForm({
    defaultValues: {
      ...existingQuery,
      processId,
      stepInstanceId,
      queryRaiserStepInstanceId,
      answerText: '', 
    },
  });

  const navigate = useNavigate();
  const { fields: summaryFields } = useFieldArray({ control, name: 'documentSummaries' });
  const { fields: changeFields, append: appendChange, remove: removeChange } = useFieldArray({ control, name: 'documentChanges' });

  const handleDocumentUpload = async (file, index, replacedDocId) => {
    if (!file) return;

    try {
      let documentName = file.name;
      
      if (replacedDocId) {
        const oldDoc = documents?.find((d) => d.id == replacedDocId);
        if (oldDoc && oldDoc.name) {
          const dotIndex = oldDoc.name.lastIndexOf('.');
          const baseName = dotIndex !== -1 ? oldDoc.name.substring(0, dotIndex) : oldDoc.name;
          const newDotIndex = file.name.lastIndexOf('.');
          const ext = newDotIndex !== -1 ? file.name.substring(newDotIndex) : '';
          documentName = `${baseName}${ext}`;
        }
      } else {
        const generatedName = await GenerateDocumentName(
          workflowId,
          replacedDocId,
          file.name.split('.').pop(),
        );
        if (!generatedName) {
          toast.error('Failed to generate document name');
          return;
        }
        documentName = generatedName.data.documentName;
      }

      const response = await uploadDocumentInProcess([file], documentName, [], storagePath, replacedDocId);

      if (!response || !response.length || !response[0]) {
        throw new Error('Upload failed or returned no document ID');
      }

      const uploadedDocumentId = response[0];
      const updatedChanges = [...getValues('documentChanges')];
      updatedChanges[index].documentId = uploadedDocumentId;
      updatedChanges[index].uploadedFileName = documentName;

      reset((prev) => ({
        ...prev,
        documentChanges: updatedChanges,
      }));

      toast.success('Document uploaded successfully');
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Unexpected error occurred');
    }
  };

  const onSubmit = async (data) => {
    try {
      const response = await CreateQuery(data);
      toast.success(response?.data?.message);
      navigate('/processes/work');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    }
  };

  return (
    <div className="space-y-6 text-slate-800">
      {/* Header */}
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
          <IconCheck className="text-emerald-500" size={26} />
          Resolve Query
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Review the raised query, provide your resolution, and upload any necessary document corrections.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        
        {/* Read-Only Context: Original Query */}
        <div className="bg-yellow-50/50 border border-yellow-200 p-4 rounded-lg shadow-sm">
          <label className="flex items-center gap-2 text-xs font-bold text-yellow-700 uppercase tracking-wider mb-2">
            <IconMessageCircleQuestion size={16} /> Original Query
          </label>
          <div className="bg-white p-3 rounded border border-yellow-100 text-slate-700 text-sm whitespace-pre-wrap">
            {watch('queryText') || <span className="italic text-slate-400">No query description provided.</span>}
          </div>
        </div>
        
        {/* Resolution Input */}
        <div className="bg-emerald-50/30 p-4 rounded-lg border border-emerald-200 shadow-sm">
          <label className="flex items-center gap-2 text-sm font-bold text-emerald-800 uppercase tracking-wider mb-2">
            <IconMessageCircle size={18} />
            Resolution / Answer Text <span className="text-red-500">*</span>
          </label>
          <textarea
            {...register('answerText')}
            required
            className="w-full border border-emerald-300 p-3 rounded-md focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 outline-none transition-all shadow-sm"
            rows={4}
            placeholder="Explain how you resolved the query..."
          />
        </div>

        {/* Read-Only Context: Document Summaries (Feedback) */}
        {summaryFields.length > 0 && (
          <div>
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">
              <IconFiles size={16} className="text-slate-500" /> Original Document Feedback
            </label>
            <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3 font-semibold w-1/3">Document Name</th>
                    <th className="p-3 font-semibold">Summary Text</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {summaryFields.map((doc, index) => (
                    <tr key={doc.documentId} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-medium text-slate-800 align-top break-words">
                        {doc?.documentDetails?.name}
                      </td>
                      <td className="p-3 align-top text-slate-600 whitespace-pre-wrap">
                        {doc.feedbackText}
                        {/* Hidden inputs to preserve existing data on submit */}
                        <input type="hidden" value={doc.feedbackText} {...register(`documentSummaries.${index}.feedbackText`)} />
                        <input type="hidden" value={doc.id} {...register(`documentSummaries.${index}.documentId`)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        {/* Document Changes Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wider">
              <IconUpload size={18} className="text-blue-500" />
              Document Changes
            </label>
            <CustomButton
              type="button"
              variant="outline"
              click={() => appendChange({ documentId: '', requiresApproval: false, isReplacement: false })}
              text={<span className="flex items-center gap-1"><IconPlus size={16}/> Add Change</span>}
              className="py-1.5 text-sm border-slate-300"
            />
          </div>

          <div className="space-y-4">
            {changeFields.length === 0 ? (
              <div className="text-center py-6 bg-slate-50 border border-dashed border-slate-300 rounded-lg text-slate-500 text-sm">
                No document changes added. Click 'Add Change' to replace or upload new documents.
              </div>
            ) : (
              changeFields.map((field, index) => {
                const isReplacement = watch(`documentChanges.${index}.isReplacement`);
                const uploadedFileName = watch(`documentChanges.${index}.uploadedFileName`);

                return (
                  <div key={field.id} className="relative bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
                    {/* Delete Button */}
                    <button
                      type="button"
                      onClick={() => removeChange(index)}
                      className="absolute top-4 right-4 text-slate-400 hover:text-red-500 transition-colors"
                      title="Remove Change"
                    >
                      <IconSquareX size={24} />
                    </button>

                    <div className="space-y-4 pr-8">
                      {/* Replacement Toggle */}
                      <label className="flex items-center gap-3 text-sm font-medium text-slate-700 cursor-pointer w-max">
                        <div className="relative flex items-center">
                          <input
                            type="checkbox"
                            className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            {...register(`documentChanges.${index}.isReplacement`)}
                          />
                        </div>
                        <span className="flex items-center gap-1.5">
                          <IconReplace size={16} className={isReplacement ? "text-blue-500" : "text-slate-400"} />
                          This is a replacement document
                        </span>
                      </label>

                      {/* Document Selection (If replacing) */}
                      {isReplacement && (
                        <div className="bg-slate-50 p-3 rounded border border-slate-200">
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                            Select Document to Replace <span className="text-red-500">*</span>
                          </label>
                          <select
                            {...register(`documentChanges.${index}.replacesDocumentId`)}
                            required
                            className="w-full border border-slate-300 p-2.5 rounded-md bg-white focus:ring-2 focus:ring-blue-100 outline-none text-sm"
                          >
                            <option value="">-- Choose Document --</option>
                            {documents?.map((doc) => (
                              <option key={doc.id} value={doc.id}>{doc.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* File Upload Area */}
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          Upload {isReplacement ? 'Corrected' : 'New'} File
                        </label>
                        <div className="flex items-center gap-4">
                          <input
                            type="file"
                            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 border border-slate-300 rounded-md bg-slate-50 cursor-pointer"
                            onChange={(e) =>
                              handleDocumentUpload(
                                e.target.files[0],
                                index,
                                getValues(`documentChanges.${index}.replacesDocumentId`)
                              )
                            }
                          />
                        </div>
                        {uploadedFileName && (
                          <p className="text-sm font-medium text-emerald-600 mt-2 flex items-center gap-1">
                            <IconCheck size={16}/> Successfully uploaded: <span className="text-slate-800">{uploadedFileName}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Action Footer */}
        <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-200">
          <CustomButton
            click={close}
            type="button"
            variant="danger"
            text="Cancel"
            disabled={isSubmitting}
            className="px-6"
          />
          <CustomButton
            type="submit"
            text="Submit Resolution"
            variant="primary"
            disabled={isSubmitting}
            className="px-6"
          />
        </div>
      </form>
    </div>
  );
}