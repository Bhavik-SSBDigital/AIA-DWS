import React, { useEffect, useState } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import ComponentLoader from '../../common/Loader/ComponentLoader';
import { IconEye } from '@tabler/icons-react';
import { GetUserLogs } from '../../common/Apis';
import CustomCard from '../../CustomComponents/CustomCard';

export default function Logs() {
  const [data, setData] = useState([]);
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      const res = await GetUserLogs(); // Assuming this returns the new structure
      setData(res?.data?.logs || []);
    } catch (error) {
      console.error(error?.response?.data?.message || error?.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredData = data.filter((item) =>
    item.processName.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleView = (id) => {
    navigate(`/logs/${id}`);
  };

  const columns = [
    { field: 'processName', headerName: 'Process Name', width: 200 },
    { field: 'initiatorName', headerName: 'Initiator', width: 200 },
    {
      field: 'createdAt',
      headerName: 'Created At',
      width: 200,
      valueGetter: (value) =>
        value ? moment(value).format('DD-MMM-YYYY hh:mm A') : '--',
    },
    // {
    //   field: 'stepName',
    //   headerName: 'Step Name',
    //   width: 150,
    // },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 150,
      renderCell: (params) => (
        <div className="flex space-x-2 m-1">
          <button
            className="p-2 bg-button-primary-default hover:bg-button-primary-hover rounded-lg"
            onClick={() => handleView(params.row.processId)}
          >
            <IconEye color="white" />
          </button>
        </div>
      ),
    },
  ];

  const rows = filteredData.map((item, index) => ({
    id: index + 1,
    processId: item.processId,
    processName: item.processName,
    initiatorName: item.initiatorName,
    createdAt: item.lastActivityAt || item.createdAt,
    // stepName: item.steps?.[0]?.stepName || '--',
  }));

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div>
      {loading ? (
        <ComponentLoader />
      ) : (
        <CustomCard>
          <label className="block text-sm font-medium text-gray-700">
            Search
          </label>
          <input
            onChange={(e) => setSearchTerm(e.target.value)}
            required
            className="w-full p-2 border rounded mb-2 max-w-[200px]"
          />
          <DataGrid
            rows={rows}
            columns={columns}
            pageSize={10}
            rowsPerPageOptions={[10]}
            autoHeight
          />
        </CustomCard>
      )}
    </div>
  );
}
