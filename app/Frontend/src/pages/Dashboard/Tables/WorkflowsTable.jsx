import React, { useState } from 'react';
import CustomButton from '../../../CustomComponents/CustomButton';
import { toast } from 'react-toastify';
import { getWorkflowAnalysisDetails } from '../../../common/Apis';
import CustomModal from '../../../CustomComponents/CustomModal';
import WorkflowAnalysisDetails from '../WorkflowAnalysisDetails';

const WorkflowsTable = ({
  data,
  setActionsLoading,
  actionsLoading,
  startDate,
  endDate,
}) => {
  if (!data || data?.length === 0) {
    return (
      <p className="text-gray-500">
        No workflows available or you don't have access.
      </p>
    );
  }

  // states
  const [openModal, setOpenModal] = useState(false);
  const [workflowAnalysisData, setWorkflowAnalysisData] = useState();

  // handlers
  const handleViewWorkflowDetails = async (id) => {
    try {
      const response = await getWorkflowAnalysisDetails(id, startDate, endDate);
      setOpenModal(true);
      setWorkflowAnalysisData(response?.data?.data);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    }
  };
  return (
    <div className="overflow-x-auto rounded shadow border border-gray-200">
      <table className="min-w-full text-sm text-left bg-white">
        <thead className="bg-gray-100 border-b text-gray-600 font-medium">
          <tr>
            <th className="px-4 py-2">Workflow ID</th>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Version</th>
            <th className="px-4 py-2">Description</th>
            <th className="px-4 py-2">Created At</th>
            {/* <th className="px-4 py-2">Updated At</th> */}
            <th className="px-4 py-2">View Workflow Details</th>
          </tr>
        </thead>
        <tbody>
          {data?.map((wf) => (
            <tr key={wf.workflowId} className="border-b hover:bg-gray-50">
              <td className="px-4 py-2">{wf.workflowId}</td>
              <td className="px-4 py-2">{wf.name}</td>
              <td className="px-4 py-2">{wf.version}</td>
              <td className="px-4 py-2">{wf.description}</td>
              <td className="px-4 py-2">
                {new Date(wf.createdAt).toLocaleString()}
              </td>
              {/* <td className="px-4 py-2">
                {new Date(wf.updatedAt).toLocaleString()}
              </td> */}
              <td className="px-4 py-2">
                <CustomButton
                  disabled={actionsLoading}
                  text={'View Details'}
                  click={() => handleViewWorkflowDetails(wf.workflowId)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <CustomModal isOpen={openModal} onClose={() => setOpenModal(false)}>
        <WorkflowAnalysisDetails
          data={workflowAnalysisData}
          setActionsLoading={setActionsLoading}
          actionsLoading={actionsLoading}
        />
      </CustomModal>
    </div>
  );
};

export default WorkflowsTable;
