import React from 'react';
import { useNavigate } from 'react-router-dom';

const ProcessesTable = ({ data }) => {
  if (!data || data.length === 0) {
    return <p className="text-gray-500">No processes available or you don't have access.</p>;
  }
  // states
  const navigate = useNavigate();

  // handler
  const handleNavigate = (id) => {
    navigate(`/timeline/${id}`);
  };

  return (
    <div className="overflow-x-auto rounded shadow border border-gray-200">
      <table className="min-w-full text-sm text-left bg-white">
        <thead className="bg-gray-100 border-b text-gray-600 font-medium">
          <tr>
            <th className="px-4 py-2">Process ID</th>
            <th className="px-4 py-2">Process Name</th>
            <th className="px-4 py-2">Initiator</th>
            <th className="px-4 py-2">Created At</th>
          </tr>
        </thead>
        <tbody>
          {data.map((proc) => (
            <tr key={proc.processId} className="border-b hover:bg-gray-50">
              <td
                onClick={() => handleNavigate(proc.processId)}
                className="px-4 py-2 text-blue-600 cursor-pointer hover:underline"
              >
                {proc.processId}
              </td>

              <td className="px-4 py-2">{proc.processName}</td>
              <td className="px-4 py-2">{proc.initiatorUsername}</td>
              <td className="px-4 py-2">
                {new Date(proc.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ProcessesTable;
