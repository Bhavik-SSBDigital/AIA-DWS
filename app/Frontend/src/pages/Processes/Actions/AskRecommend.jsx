import React, { useEffect, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import CustomButton from '../../../CustomComponents/CustomButton';
import { IconSquareX } from '@tabler/icons-react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { createRecommend, GetUsersWithDetails } from '../../../common/Apis';

export default function AskRecommend({
  processId,
  steps,
  close,
  stepInstanceId,
  initiatorName = '',
  documents,
}) {
  // variables
  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    reset,
    watch,
    formState: { isSubmitting },
  } = useForm({
    defaultValues: {
      processId,
      stepInstanceId,
      recommendationText: '',
      recommenderUsername: '',
      documentSummaries: [],
    },
  });
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const {
    fields: summaryFields,
    append: appendSummary,
    remove: removeSummary,
  } = useFieldArray({ control, name: 'documentSummaries' });

  //   handlers
  const onSubmit = async (data) => {
    const validSummaries = data.documentSummaries.filter(
      (doc) => doc.queryText && doc.queryText.trim() !== '',
    );

    // Step 2: Validation — at least one required
    if (validSummaries.length === 0) {
      toast.warn('Please provide at least one Query Text.');
      return; // stop submission
    }

    try {
      const response = await createRecommend({
        ...data,
        documentSummaries: validSummaries,
      });
      toast.success(response?.data?.message);
      navigate('/processes/work');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    }
  };

  const getUsers = async () => {
    try {
      const response = await GetUsersWithDetails();
      setUsers(
        response?.data?.filter((user) => user.username !== initiatorName),
      );
    } catch (error) {
      console.error(error?.response?.data?.message || error?.message);
    }
  };

  //   network
  useEffect(() => {
    getUsers();
  }, []);

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">
            Recommendation
          </label>
          <textarea
            {...register('recommendationText')}
            required
            className="w-full border p-2 rounded"
            rows={3}
            placeholder="Write your query here"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Select Recommendation User
          </label>
          <select
            {...register('recommenderUsername')}
            required
            className="w-full border p-2 rounded"
            defaultValue=""
          >
            <option value="" disabled>
              Select user
            </option>
            {users?.map((user, index) => {
              const roles = user.roles?.join(', ') || 'No Roles';
              const departments = user.departments?.length
                ? `(${user.departments.join(', ')})`
                : '';

              return (
                <option key={user.id} value={user.username}>
                  {`${user.username} - ${roles} ${departments}`}
                </option>
              );
            })}
          </select>
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-2">Document Summaries</h3>
          <table className="w-full border border-gray-300 text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border p-2 text-left">Document Name</th>
                <th className="border p-2 text-left">Summary Text</th>
                {/* <th className="border p-2 text-left">Requires Approval</th> */}
              </tr>
            </thead>
            <tbody>
              {documents?.map((doc, index) => (
                <tr key={doc.id} className="bg-white">
                  <td className="border p-2">{doc.name}</td>
                  <td className="border p-2">
                    <textarea
                      {...register(`documentSummaries.${index}.queryText`)}
                      className="w-full border p-2 rounded"
                      rows={2}
                      placeholder="Enter document summary"
                    />
                    {/* Hidden input for documentId */}
                    <input
                      type="hidden"
                      value={doc.id}
                      {...register(`documentSummaries.${index}.documentId`)}
                    />
                  </td>
                  <td className="border p-2 hidden">
                    <label className="inline-flex items-center space-x-2">
                      <input
                        type="checkbox"
                        {...register(
                          `documentSummaries.${index}.requiresApproval`,
                        )}
                        className="h-4 w-4"
                      />
                      <span className="text-sm">Yes</span>
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-1">
          <CustomButton
            className={'w-full'}
            click={close}
            type="button"
            variant={'danger'}
            text={'Cancel'}
            disabled={isSubmitting}
          />
          <CustomButton
            className={'w-full'}
            type="submit"
            text={'Submit'}
            disabled={isSubmitting}
          />
        </div>
      </form>
    </div>
  );
}
