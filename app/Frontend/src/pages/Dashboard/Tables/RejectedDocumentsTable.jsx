import React, { useState } from 'react';
import ViewFile from '../../view/View';
import CustomButton from '../../../CustomComponents/CustomButton';
import { toast } from 'react-toastify';
import { ViewDocument } from '../../../common/Apis';

const RejectedDocumentsTable = ({
  data,
  setActionsLoading,
  actionsLoading,
}) => {
  if (!data || data?.length === 0) {
    return <p className="text-gray-500">No rejected documents available or you don't have access.</p>;
  }

  // states
  const [fileView, setFileView] = useState(null);

  // handlers
  const handleViewFile = async (name, path, fileId, type, isEditing) => {
    setActionsLoading(true);
    try {
      const fileData = await ViewDocument(name, path, type, fileId);
      setFileView(fileData);
    } catch (error) {
      console.error('Error:', error);
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setActionsLoading(false);
    }
  };

  return (
    <div className="overflow-x-auto rounded shadow border border-gray-200">
      <table className="min-w-full text-sm text-left bg-white">
        <thead className="bg-gray-100 border-b text-gray-600 font-medium">
          <tr>
            <th className="px-4 py-2">Document Name</th>
            <th className="px-4 py-2">Process Name</th>
            <th className="px-4 py-2">Path</th>
            <th className="px-4 py-2">Rejected At</th>
          </tr>
        </thead>
        <tbody>
          {data?.map((doc) => (
            <tr key={doc.documentId} className="border-b hover:bg-gray-50">
              <td className="px-4 py-2">{doc.documentName}</td>
              <td className="px-4 py-2">{doc.processName}</td>
              <td className="px-4 py-2">{doc.documentPath}</td>
              <td className="px-4 py-2">
                {new Date(doc.rejectedAt).toLocaleString()}
              </td>
              <td className="px-4 py-2">
                <CustomButton
                  disabled={actionsLoading}
                  text={'View File'}
                  click={() =>
                    handleViewFile(
                      doc.documentName,
                      doc.documentPath,
                      doc.documentId,
                      doc.documentType,
                    )
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* View File Modal */}
      {fileView && (
        <ViewFile
          docu={fileView}
          setFileView={setFileView}
          handleViewClose={() => setFileView(null)}
        />
      )}
    </div>
  );
};

export default RejectedDocumentsTable;
