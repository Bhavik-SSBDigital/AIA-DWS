// import React, { useEffect, useState } from 'react';
// import { DataGrid } from '@mui/x-data-grid';
// import { useNavigate } from 'react-router-dom';
// import moment from 'moment';
// import ComponentLoader from '../../common/Loader/ComponentLoader';
// import { IconEye } from '@tabler/icons-react';
// import { GetUserLogs } from '../../common/Apis';
// import CustomCard from '../../CustomComponents/CustomCard';

// export default function Logs() {
//   const [data, setData] = useState([]);
//   const navigate = useNavigate();
//   const [searchTerm, setSearchTerm] = useState('');
//   const [loading, setLoading] = useState(true);

//   const fetchLogs = async () => {
//     try {
//       const res = await GetUserLogs(); // Assuming this returns the new structure
//       setData(res?.data?.logs || []);
//     } catch (error) {
//       console.error(error?.response?.data?.message || error?.message);
//     } finally {
//       setLoading(false);
//     }
//   };

//   const filteredData = data.filter((item) =>
//     item.processName.toLowerCase().includes(searchTerm.toLowerCase()),
//   );

//   const handleView = (id) => {
//     navigate(`/logs/${id}`);
//   };

//   const columns = [
//     { field: 'processName', headerName: 'Process Name', width: 200 },
//     { field: 'initiatorName', headerName: 'Initiator', width: 200 },
//     {
//       field: 'createdAt',
//       headerName: 'Created At',
//       width: 200,
//       valueGetter: (value) =>
//         value ? moment(value).format('DD-MMM-YYYY hh:mm A') : '--',
//     },
//     // {
//     //   field: 'stepName',
//     //   headerName: 'Step Name',
//     //   width: 150,
//     // },
//     {
//       field: 'actions',
//       headerName: 'Actions',
//       width: 150,
//       renderCell: (params) => (
//         <div className="flex space-x-2 m-1">
//           <button
//             className="p-2 bg-button-primary-default hover:bg-button-primary-hover rounded-lg"
//             onClick={() => handleView(params.row.processId)}
//           >
//             <IconEye color="white" />
//           </button>
//         </div>
//       ),
//     },
//   ];

//   const rows = filteredData.map((item, index) => ({
//     id: index + 1,
//     processId: item.processId,
//     processName: item.processName,
//     initiatorName: item.initiatorName,
//     createdAt: item.lastActivityAt || item.createdAt,
//     // stepName: item.steps?.[0]?.stepName || '--',
//   }));

//   useEffect(() => {
//     fetchLogs();
//   }, []);

//   return (
//     <div>
//       {loading ? (
//         <ComponentLoader />
//       ) : (
//         <CustomCard>
//           <label className="block text-sm font-medium text-gray-700">
//             Search
//           </label>
//           <input
//             onChange={(e) => setSearchTerm(e.target.value)}
//             required
//             className="w-full p-2 border rounded mb-2 max-w-[200px]"
//           />
//           <DataGrid
//             rows={rows}
//             columns={columns}
//             pageSize={10}
//             rowsPerPageOptions={[10]}
//             autoHeight
//           />
//         </CustomCard>
//       )}
//     </div>
//   );
// }

import React, { useEffect, useState } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import ComponentLoader from '../../common/Loader/ComponentLoader';
import { IconEye, IconSearch, IconX, IconFilter } from '@tabler/icons-react';
import { GetUserLogs } from '../../common/Apis';
import CustomCard from '../../CustomComponents/CustomCard';
import CustomModal from '../../CustomComponents/CustomModal';

export default function Logs() {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: '',
  });
  const [selectedProcess, setSelectedProcess] = useState('');
  const [selectedInitiator, setSelectedInitiator] = useState('');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  // Available filter options
  const [processOptions, setProcessOptions] = useState([]);
  const [initiatorOptions, setInitiatorOptions] = useState([]);

  const fetchLogs = async () => {
    try {
      const res = await GetUserLogs();
      const logs = res?.data?.logs || [];
      setData(logs);
      setFilteredData(logs);

      // Extract unique values for filter options
      const processes = [...new Set(logs.map((item) => item.processName))];
      const initiators = [...new Set(logs.map((item) => item.initiatorName))];

      setProcessOptions(processes);
      setInitiatorOptions(initiators);
    } catch (error) {
      console.error(error?.response?.data?.message || error?.message);
    } finally {
      setLoading(false);
    }
  };

  // Apply all filters
  useEffect(() => {
    let result = [...data];

    // Text search filter
    if (searchTerm) {
      result = result.filter(
        (item) =>
          item.processName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.initiatorName?.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    // Process filter
    if (selectedProcess) {
      result = result.filter((item) => item.processName === selectedProcess);
    }

    // Initiator filter
    if (selectedInitiator) {
      result = result.filter(
        (item) => item.initiatorName === selectedInitiator,
      );
    }

    // Date range filter
    if (dateRange.startDate && dateRange.endDate) {
      result = result.filter((item) => {
        const itemDate = moment(item.lastActivityAt || item.createdAt);
        return itemDate.isBetween(
          moment(dateRange.startDate).startOf('day'),
          moment(dateRange.endDate).endOf('day'),
          null,
          '[]',
        );
      });
    } else if (dateRange.startDate) {
      result = result.filter((item) => {
        const itemDate = moment(item.lastActivityAt || item.createdAt);
        return itemDate.isSameOrAfter(
          moment(dateRange.startDate).startOf('day'),
        );
      });
    } else if (dateRange.endDate) {
      result = result.filter((item) => {
        const itemDate = moment(item.lastActivityAt || item.createdAt);
        return itemDate.isSameOrBefore(moment(dateRange.endDate).endOf('day'));
      });
    }

    setFilteredData(result);
  }, [data, searchTerm, selectedProcess, selectedInitiator, dateRange]);

  const handleView = (id) => {
    navigate(`/logs/${id}`);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedProcess('');
    setSelectedInitiator('');
    setDateRange({ startDate: '', endDate: '' });
    setIsFilterModalOpen(false);
  };

  const removeFilter = (filterType) => {
    switch (filterType) {
      case 'search':
        setSearchTerm('');
        break;
      case 'process':
        setSelectedProcess('');
        break;
      case 'initiator':
        setSelectedInitiator('');
        break;
      case 'date':
        setDateRange({ startDate: '', endDate: '' });
        break;
      default:
        break;
    }
  };

  const applyFilters = () => {
    setIsFilterModalOpen(false);
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (searchTerm) count++;
    if (selectedProcess) count++;
    if (selectedInitiator) count++;
    if (dateRange.startDate || dateRange.endDate) count++;
    return count;
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
    {
      field: 'stepCount',
      headerName: 'Steps',
      width: 100,
      renderCell: (params) => (
        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
          {params.value || 0}
        </span>
      ),
    },
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
            <IconEye color="white" size={18} />
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
    stepCount: item.steps?.length || 0,
  }));

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="p-6">
      {loading ? (
        <ComponentLoader />
      ) : (
        <CustomCard>
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold">Process Logs</h2>

            <button
              onClick={() => setIsFilterModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="relative">
                <IconFilter size={20} />
                {getActiveFilterCount() > 0 && (
                  <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {getActiveFilterCount()}
                  </span>
                )}
              </div>
              Filters
            </button>
          </div>

          {/* Active filters */}
          {getActiveFilterCount() > 0 && (
            <div className="bg-gray-50 p-4 rounded-lg mb-6">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-600">Active Filters:</span>
                {searchTerm && (
                  <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                    Search: {searchTerm}
                    <button
                      onClick={() => removeFilter('search')}
                      className="hover:text-blue-600"
                    >
                      <IconX size={14} />
                    </button>
                  </span>
                )}
                {selectedProcess && (
                  <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                    Process: {selectedProcess}
                    <button
                      onClick={() => removeFilter('process')}
                      className="hover:text-blue-600"
                    >
                      <IconX size={14} />
                    </button>
                  </span>
                )}
                {selectedInitiator && (
                  <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                    Initiator: {selectedInitiator}
                    <button
                      onClick={() => removeFilter('initiator')}
                      className="hover:text-blue-600"
                    >
                      <IconX size={14} />
                    </button>
                  </span>
                )}
                {(dateRange.startDate || dateRange.endDate) && (
                  <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                    Date:{' '}
                    {dateRange.startDate
                      ? moment(dateRange.startDate).format('DD-MMM-YY')
                      : 'Any'}{' '}
                    -{' '}
                    {dateRange.endDate
                      ? moment(dateRange.endDate).format('DD-MMM-YY')
                      : 'Any'}
                    <button
                      onClick={() => removeFilter('date')}
                      className="hover:text-blue-600"
                    >
                      <IconX size={14} />
                    </button>
                  </span>
                )}
                <button
                  onClick={clearFilters}
                  className="ml-auto text-sm text-blue-600 hover:text-blue-800"
                >
                  Clear All
                </button>
              </div>
            </div>
          )}

          {/* Results summary */}
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-600">
              Showing {filteredData.length} of {data.length} records
            </p>
            <div className="col-span-2">
              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by process or initiator..."
                  className="w-full p-2 pl-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <IconSearch
                  size={18}
                  className="absolute left-3 top-3.5 text-gray-400"
                />
              </div>
            </div>
          </div>

          {/* Data grid */}
          <DataGrid
            rows={rows}
            columns={columns}
            pageSize={10}
            rowsPerPageOptions={[10, 25, 50]}
            autoHeight
            disableSelectionOnClick
            className="border rounded-lg"
          />

          {/* Filter Modal */}
          <CustomModal
            isOpen={isFilterModalOpen}
            onClose={() => setIsFilterModalOpen(false)}
            size="3xl"
            className="bg-white"
          >
            <div className="relative">
              {/* Modal Header */}
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold">Filter Logs</h3>
                <button
                  onClick={() => setIsFilterModalOpen(false)}
                  className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <IconX size={20} />
                </button>
              </div>

              {/* Filter Content */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Search */}

                {/* Process filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Process Name
                  </label>
                  <select
                    value={selectedProcess}
                    onChange={(e) => setSelectedProcess(e.target.value)}
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Processes</option>
                    {processOptions.map((process) => (
                      <option key={process} value={process}>
                        {process}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Initiator filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Initiator
                  </label>
                  <select
                    value={selectedInitiator}
                    onChange={(e) => setSelectedInitiator(e.target.value)}
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Initiators</option>
                    {initiatorOptions.map((initiator) => (
                      <option key={initiator} value={initiator}>
                        {initiator}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date range */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date Range
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <input
                        type="date"
                        value={dateRange.startDate}
                        onChange={(e) =>
                          setDateRange({
                            ...dateRange,
                            startDate: e.target.value,
                          })
                        }
                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <input
                        type="date"
                        value={dateRange.endDate}
                        onChange={(e) =>
                          setDateRange({
                            ...dateRange,
                            endDate: e.target.value,
                          })
                        }
                        min={dateRange.startDate}
                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end gap-3 mt-8 pt-4 border-t">
                <button
                  onClick={clearFilters}
                  className="px-6 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Clear All
                </button>
                <button
                  onClick={applyFilters}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </CustomModal>
        </CustomCard>
      )}
    </div>
  );
}
