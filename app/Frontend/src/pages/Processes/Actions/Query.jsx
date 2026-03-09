import React, { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import CustomButton from '../../../CustomComponents/CustomButton';
import { IconSquareX, IconMessageReport, IconFileDescription, IconAlertCircle } from '@tabler/icons-react';
import { toast } from 'react-toastify';
import { CreateQuery } from '../../../common/Apis';
import { useNavigate } from 'react-router-dom';

export default function Query({
  workflowId,
  processId,
  steps,
  close,
  stepInstanceId,
  documents,
  storagePath,
}) {
  const {
    register,
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm({
    defaultValues: {
      processId,
      stepInstanceId,
      queryText: '',
      documentChanges: [],
      documentSummaries: [],
    },
  });

  const navigate = useNavigate();

  const onSubmit = async (data) => {
    try {
      const filteredSummaries = data.documentSummaries.filter(
        (summary) => summary.feedbackText?.trim() !== '',
      );
      delete data.assignedStepName;
      delete data.assignedAssigneeId;

      const finalData = {
        ...data,
        documentSummaries: filteredSummaries,
      };

      const response = await CreateQuery(finalData);
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
          <IconMessageReport className="text-yellow-500" size={24} />
          Raise a Query / Rejection
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Provide a detailed explanation for this query and add specific feedback for individual documents if necessary.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Main Query Text */}
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wider mb-2">
            <IconAlertCircle size={16} className="text-slate-500" />
            Query / Rejection Description <span className="text-red-500">*</span>
          </label>
          <textarea
            {...register('queryText')}
            required
            className="w-full border border-slate-300 p-3 rounded-md focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all shadow-sm"
            rows={4}
            placeholder="Please detail the reason for returning or querying this process..."
          />
        </div>

        {/* Document Summaries */}
        {documents?.length > 0 && (
          <div>
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">
              <IconFileDescription size={16} className="text-slate-500" />
              Document-Specific Feedback (Optional)
            </label>
            <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3 font-semibold w-1/3">Document Name</th>
                    <th className="p-3 font-semibold">Specific Feedback</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {documents.map((doc, index) => (
                    <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-medium text-slate-800 align-top break-words">
                        {doc.name}
                      </td>
                      <td className="p-3 align-top">
                        <textarea
                          {...register(`documentSummaries.${index}.feedbackText`)}
                          className="w-full border border-slate-300 p-2 rounded-md focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none text-sm transition-all"
                          rows={2}
                          placeholder="Feedback regarding this specific document..."
                        />
                        <input
                          type="hidden"
                          value={doc.id}
                          {...register(`documentSummaries.${index}.documentId`)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
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
            text="Submit Query"
            variant="primary"
            disabled={isSubmitting}
            className="px-6"
          />
        </div>
      </form>
    </div>
  );
}