import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import {
  Box, Autocomplete, TextField, Tabs, Tab, CircularProgress,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import { toast } from 'react-toastify';
import {
  IconEye, IconSearch, IconRefresh, IconClockHour4, IconShieldCheck,
  IconX, IconFilter, IconListNumbers, IconPackage, IconCalendar,
} from '@tabler/icons-react';
import { GetProcessesList, GetAllProcessesForAdmin } from '../../common/Apis';
import CustomCard from '../../CustomComponents/CustomCard';

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_META = {
  IN_PROGRESS:    { label: 'In Progress', color: '#3b82f6', bg: '#eff6ff', border: '#93c5fd' },
  PENDING:        { label: 'Pending',     color: '#f59e0b', bg: '#fffbeb', border: '#fcd34d' },
  COMPLETED:      { label: 'Completed',   color: '#10b981', bg: '#f0fdf4', border: '#6ee7b7' },
REJECTED:       { label: 'Rejected',    color: '#ef4444', bg: '#fef2f2', border: '#fca5a5' },
  PO_NO_ATTACHED: { label: 'PO Attached', color: '#8b5cf6', bg: '#f5f3ff', border: '#c4b5fd' },
};

const PAYMENT_MODE_OPTIONS = ['All', 'ON_APPROVAL', 'ON_DATE'];
const PAGE_SIZE_OPTIONS = [10, 15, 25, 50, 100];

const gridStyles = {
  backgroundColor: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: '0.5rem',
  boxShadow: '0 1px 3px 0 rgba(0,0,0,0.06)',
  '& .MuiDataGrid-columnHeaders': {
    backgroundColor: '#f8fafc', borderBottom: '1px solid #e5e7eb',
    color: '#374151', fontSize: '0.8125rem', fontWeight: 600,
  },
  '& .MuiDataGrid-row': {
    borderBottom: '1px solid #f1f5f9', transition: 'background-color 100ms',
    '&:hover': { backgroundColor: '#f8fafc' },
  },
  '& .MuiDataGrid-cell': {
    borderBottom: 'none',
    '&:focus': { outline: 'none' },
    '&:focus-within': { outline: 'none' },
  },
  '& .MuiDataGrid-columnSeparator': { display: 'none' },
  '& .MuiDataGrid-footerContainer': { borderTop: '1px solid #e5e7eb' },
};

// ─── Filter Components ────────────────────────────────────────────────────────
function FilterInput({ label, icon, value, onChange, placeholder, type = 'text' }) {
  return (
    <div className="flex flex-col gap-1 w-full">
      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-100 transition-all h-[36px]">
        {icon && <span className="text-gray-400 flex-shrink-0">{icon}</span>}
        <input
          type={type}
          className="flex-1 text-sm outline-none text-gray-700 placeholder-gray-400 bg-transparent min-w-0"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && (
          <button onClick={() => onChange('')} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
            <IconX size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function FilterAutocomplete({
  label, value, onChange, options, placeholder = "Type or select...",
  getDisplayValue = (v) => String(v),
}) {
  return (
    <div className="flex flex-col gap-1 w-full">
      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      <Autocomplete
        freeSolo size="small" options={options}
        getOptionLabel={(option) => option ? getDisplayValue(option) : ''}
        value={value === 'All' ? null : value}
        onChange={(event, newValue) => onChange(newValue || 'All')}
        onInputChange={(event, newInputValue, reason) => {
          if (reason === 'input' || reason === 'clear') onChange(newInputValue || 'All');
        }}
        renderInput={(params) => (
          <TextField
            {...params} placeholder={placeholder}
            sx={{
              backgroundColor: 'white',
              '& .MuiOutlinedInput-root': {
                padding: '2px 8px', fontSize: '0.875rem', borderRadius: '0.5rem', minHeight: '36px',
                '& fieldset': { borderColor: '#e5e7eb' },
                '&:hover fieldset': { borderColor: '#d1d5db' },
                '&.Mui-focused fieldset': { borderColor: '#60a5fa', borderWidth: '1px' },
              },
            }}
          />
        )}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WorkList() {
  const navigate = useNavigate();

  const isAdmin      = sessionStorage.getItem('isAdmin')    === 'true';
  const isRootUser   = sessionStorage.getItem('specialUser') === 'true' || sessionStorage.getItem('isRootUser') === 'true';
  const isPrivileged = isAdmin || isRootUser;

  const getFilterDisplayValue = useCallback((val) => {
    if (!val || val === 'All') return 'All';
    if (STATUS_META[val]) return STATUS_META[val].label;
    if (val === 'ON_APPROVAL') return 'On Approval';
    if (val === 'ON_DATE') return 'On Date';
    return String(val);
  }, []);

  const [activeTab, setActiveTab] = useState(0);

  // ── Data & Pagination ────────────────────────────────────────────────────
  const [dataRows, setDataRows]               = useState([]);
  const [total, setTotal]                     = useState(0);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 15 });
  const [loading, setLoading]                 = useState(true);
  const [fetching, setFetching]               = useState(false);

  // ── Filters ──────────────────────────────────────────────────────────────
  const [searchInput, setSearchInput]                 = useState('');
  const [search, setSearch]                           = useState('');
  const [poSearch, setPoSearch]                       = useState('All');
  const [tagSearch, setTagSearch]                     = useState('All');
  const [selectedWorkflow, setSelectedWorkflow]       = useState('All');
  const [selectedStatus, setSelectedStatus]           = useState('All');
  const [selectedPaymentMode, setSelectedPaymentMode] = useState('All');
  const [createdFrom, setCreatedFrom]                 = useState('');
  const [createdTo, setCreatedTo]                     = useState('');
  const [paymentFrom, setPaymentFrom]                 = useState('');
  const [paymentTo, setPaymentTo]                     = useState('');

  // ── Dropdown Options (populated from API's filterOptions) ────────────────
  // Filter options always reflect the FULL dataset — not just the current page.
  // The backend returns these from an unfiltered query every time.
  const [workflowOptions, setWorkflowOptions] = useState(['All']);
  const [poOptions, setPoOptions]             = useState(['All']);
  const [tagOptions, setTagOptions]           = useState(['All']);
  const [statusOptions]                       = useState(['All', ...Object.keys(STATUS_META)]);

  const [pendingCount, setPendingCount] = useState(0);
  const [allCount, setAllCount]         = useState(0);
  const debounceSearch                  = useRef(null);

  // ── Build API Params ─────────────────────────────────────────────────────
  const buildParams = useCallback(() => {
    const params = {
      page: paginationModel.page + 1, // MUI DataGrid is 0-indexed, API is 1-indexed
      limit: paginationModel.pageSize,
      pageSize: paginationModel.pageSize,
    };
    if (search)                            params.search        = search;
    if (poSearch !== 'All')                params.poNumber      = poSearch;
    if (tagSearch !== 'All')               params.tag           = tagSearch;
    if (selectedWorkflow !== 'All')        params.workflowName  = selectedWorkflow;
    if (selectedStatus !== 'All')          params.status        = selectedStatus;
    if (selectedPaymentMode !== 'All')     params.paymentMode   = selectedPaymentMode;
    if (createdFrom)                       params.createdDateFrom  = createdFrom;
    if (createdTo)                         params.createdDateTo    = createdTo;
    if (paymentFrom)                       params.paymentDateFrom  = paymentFrom;
    if (paymentTo)                         params.paymentDateTo    = paymentTo;
    return params;
  }, [
    paginationModel.page, paginationModel.pageSize,
    search, poSearch, tagSearch, selectedWorkflow, selectedStatus,
    selectedPaymentMode, createdFrom, createdTo, paymentFrom, paymentTo,
  ]);

  // ── Fetch Data ───────────────────────────────────────────────────────────
  // Every filter change or page change calls this.
  // The backend ALWAYS returns filterOptions from the full unfiltered dataset,
  // so dropdowns stay complete regardless of what filters are active.
  const fetchData = useCallback(async (isFirst = false) => {
    if (isFirst) setLoading(true);
    setFetching(true);

    try {
      const params = buildParams();
      const apiCall = activeTab === 0 ? GetProcessesList : GetAllProcessesForAdmin;
      const res = await apiCall(params);

      const rawData  = res?.data?.data || res?.data?.processes || [];
      const pagTotal = res?.data?.total || rawData.length;

      setDataRows(rawData.map((item, i) => ({
        id: item.id || item._id || item.processId || `r-${i}`,
        ...item,
      })));
      setTotal(pagTotal);

      // ── Update filter option dropdowns ──────────────────────────────────
      // These come from the full unfiltered dataset on the backend,
      // so they never shrink as the user applies filters.
      const opts = res?.data?.filterOptions || {};
      if (opts.workflows) setWorkflowOptions(['All', ...opts.workflows]);
      if (opts.poNumbers) setPoOptions(['All', ...opts.poNumbers]);
      if (opts.tags)      setTagOptions(['All', ...opts.tags]);

      // Fetch summary counts once on first load
      if (isFirst) {
        try {
          const myBase = await GetProcessesList({ page: 1, limit: 1 });
          setPendingCount(myBase?.data?.total || 0);
          if (isPrivileged) {
            const allBase = await GetAllProcessesForAdmin({ page: 1, limit: 1 });
            setAllCount(allBase?.data?.total || 0);
          }
        } catch { /* ignore count errors */ }
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load processes');
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [activeTab, buildParams, isPrivileged]);

  // Re-fetch whenever pagination or any filter changes
  useEffect(() => {
    fetchData(dataRows.length === 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    paginationModel.page, paginationModel.pageSize,
    search, poSearch, tagSearch, selectedWorkflow, selectedStatus,
    selectedPaymentMode, createdFrom, createdTo, paymentFrom, paymentTo,
    activeTab,
  ]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSearchChange = (v) => {
    setSearchInput(v);
    clearTimeout(debounceSearch.current);
    debounceSearch.current = setTimeout(() => {
      setSearch(v);
      setPaginationModel(p => ({ ...p, page: 0 }));
    }, 500);
  };

  // Helper: update a filter and reset to page 0
  const setFilter = useCallback((setter) => (v) => {
    setter(v);
    setPaginationModel(p => ({ ...p, page: 0 }));
  }, []);

  const handleTabChange = (_, v) => {
    setActiveTab(v);
    setPaginationModel(p => ({ ...p, page: 0 }));
  };

  const resetFilters = () => {
    setSearchInput(''); setSearch('');
    setPoSearch('All'); setTagSearch('All');
    setSelectedWorkflow('All'); setSelectedStatus('All'); setSelectedPaymentMode('All');
    setCreatedFrom(''); setCreatedTo('');
    setPaymentFrom(''); setPaymentTo('');
    setPaginationModel(p => ({ ...p, page: 0 }));
  };

  const hasActiveFilters = (
    search || poSearch !== 'All' || tagSearch !== 'All' ||
    selectedWorkflow !== 'All' || selectedStatus !== 'All' || selectedPaymentMode !== 'All' ||
    createdFrom || createdTo || paymentFrom || paymentTo
  );

  const handleView = (id) =>
    navigate(`/process/view/${id}${activeTab === 1 ? '?adminView=true' : ''}`);

  // ── Columns ──────────────────────────────────────────────────────────────
  const columns = [
    {
      field: 'processName',
      headerName: 'Process',
      flex: 2, minWidth: 240, disableColumnMenu: true,
      renderCell: (params) => (
        <div className="flex flex-col justify-center h-full py-2 gap-0.5">
         <span
        // CHANGE THIS LINE:
        onClick={() => handleView(params.row.processId || params.row.id)}
        className="text-blue-600 cursor-pointer hover:underline font-semibold text-sm truncate"
        title={params.value}
      >
        {params.value || '—'}
      </span>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <span className="text-xs text-gray-400">by {params.row.initiatorName || '—'}</span>
            {isPrivileged && !params.row.isOwnProcess && (
              <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 border border-purple-100 text-xs rounded font-medium">
                Others
              </span>
            )}
          </div>
          {params.row.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {params.row.tags.slice(0, 3).map((tag, i) => (
                <span key={i} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded border border-gray-200">
                  {tag}
                </span>
              ))}
              {params.row.tags.length > 3 && (
                <span className="text-xs text-gray-400">+{params.row.tags.length - 3}</span>
              )}
            </div>
          )}
        </div>
      ),
    },
    {
      field: 'workflowName',
      headerName: 'Workflow',
      flex: 1, minWidth: 150, disableColumnMenu: true,
      renderCell: (params) => (
        <div className="flex flex-col justify-center h-full py-2">
          <span className="text-gray-700 text-sm font-medium">{params.value || '—'}</span>
          {params.row.currentStepName && (
            <span className="text-xs text-gray-400 mt-0.5">↳ {params.row.currentStepName}</span>
          )}
        </div>
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 135, disableColumnMenu: true,
      renderCell: (params) => {
        const meta = STATUS_META[params.value] || STATUS_META.PENDING;
        return (
          <div className="flex items-center h-full">
            <span
              className="px-2.5 py-1 text-[11px] uppercase tracking-wider rounded-md font-bold border whitespace-nowrap"
              style={{ color: meta.color, backgroundColor: meta.bg, borderColor: meta.border }}
            >
              {meta.label || params.value}
            </span>
          </div>
        );
      },
    },
    {
      field: 'poNumbers',
      headerName: 'PO Numbers',
      width: 150, disableColumnMenu: true,
      renderCell: (params) => (
        <div className="flex items-center h-full flex-wrap gap-1 py-2">
          {params.value?.length > 0 ? (
            <>
              {params.value.slice(0, 2).map((po, i) => (
                <span key={i} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 text-xs rounded font-medium">
                  {po}
                </span>
              ))}
              {params.value.length > 2 && (
                <span className="text-xs text-gray-400">+{params.value.length - 2}</span>
              )}
            </>
          ) : <span className="text-xs text-gray-400">—</span>}
        </div>
      ),
    },
    {
      field: 'paymentMode',
      headerName: 'Payment',
      width: 145, disableColumnMenu: true,
      renderCell: (params) => (
        <div className="flex flex-col justify-center h-full py-2">
          {params.value ? (
            <>
              <span
                className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border w-fit"
                style={{
                  color: params.value === 'ON_APPROVAL' ? '#10b981' : '#3b82f6',
                  backgroundColor: params.value === 'ON_APPROVAL' ? '#f0fdf4' : '#eff6ff',
                  borderColor: params.value === 'ON_APPROVAL' ? '#6ee7b7' : '#93c5fd',
                }}
              >
                {params.value.replace(/_/g, ' ')}
              </span>
              {params.row.paymentDate && (
                <span className="text-xs text-gray-400 mt-0.5 flex items-center gap-0.5">
                  <IconCalendar size={10} />
                  {moment(params.row.paymentDate).format('DD MMM YY')}
                </span>
              )}
            </>
          ) : <span className="text-xs text-gray-400">—</span>}
        </div>
      ),
    },
    {
      field: 'createdAt',
      headerName: 'Created Date',
      width: 140, disableColumnMenu: true,
      renderCell: (params) => (
        <div className="flex flex-col justify-center h-full py-2">
          <span className="text-xs text-gray-700 font-medium">
            {params.value ? moment(params.value).format('DD MMM YYYY') : '—'}
          </span>
          <span className="text-[11px] text-gray-400">
            {params.value ? moment(params.value).format('hh:mm A') : ''}
          </span>
        </div>
      ),
    },
    {
      field: 'actions',
      headerName: '',
      width: 64, sortable: false, disableColumnMenu: true,
      renderCell: (params) => (
        <div className="flex items-center justify-center h-full w-full">
          <button
            onClick={() => handleView(params.row.processId || params.row.id)}
            className="p-1.5 bg-blue-600 hover:bg-blue-700 transition-all duration-150 rounded-md shadow-sm focus:outline-none"
            title="View Process"
          >
            <IconEye size={16} color="white" />
          </button>
        </div>
      ),
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <CustomCard>
        <div className="flex items-center justify-center h-[60vh] flex-col gap-4">
          <CircularProgress size={40} thickness={4} />
          <span className="text-sm font-medium text-gray-500 animate-pulse">Loading processes...</span>
        </div>
      </CustomCard>
    );
  }

  return (
    <div className="animate-fade-in">
      <CustomCard>

        {/* ── Summary & Actions Row ───────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-purple-50 border border-purple-200 rounded-xl">
            <span className="text-2xl font-bold text-purple-700 leading-none">{pendingCount}</span>
            <span className="text-xs text-purple-500 leading-tight">My<br />Pending</span>
          </div>
          {isPrivileged && (
            <div className="flex items-center gap-2.5 px-4 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm">
              <IconShieldCheck size={20} className="text-gray-400 flex-shrink-0" />
              <span className="text-2xl font-bold text-gray-800 leading-none">{allCount}</span>
              <span className="text-xs text-gray-500 leading-tight">All<br />Processes</span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm">
              <IconListNumbers size={16} className="text-gray-400" />
              <label htmlFor="pageSizeSelect" className="text-xs font-semibold text-gray-600">Per Page:</label>
              <select
                id="pageSizeSelect"
                value={paginationModel.pageSize}
                onChange={(e) => setPaginationModel(p => ({ ...p, pageSize: Number(e.target.value), page: 0 }))}
                className="text-xs font-medium bg-transparent text-gray-800 outline-none cursor-pointer focus:ring-0"
              >
                {PAGE_SIZE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}
              </select>
            </div>
            <button
              onClick={() => fetchData()}
              disabled={fetching}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
            >
              <IconRefresh size={14} className={fetching ? 'animate-spin' : ''} /> Refresh Data
            </button>
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
          <Tabs
            value={activeTab} onChange={handleTabChange}
            textColor="primary" indicatorColor="primary"
            variant="scrollable" scrollButtons="auto"
            sx={{ '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, fontSize: '0.875rem' } }}
          >
            <Tab label={<span className="flex items-center gap-1.5"><IconClockHour4 size={16} />My Pending Work</span>} />
            {isPrivileged && (
              <Tab label={<span className="flex items-center gap-1.5"><IconShieldCheck size={16} />All Processes</span>} />
            )}
          </Tabs>
        </Box>

        {/* ── Filters Panel ───────────────────────────────────────────────── */}
        <div className="mb-5 p-4 bg-gray-50 border border-gray-200 rounded-xl shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <IconFilter size={16} className="text-blue-600" />
            <span className="text-sm font-bold text-gray-800">Filter Processes</span>
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="ml-auto flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-700 px-2.5 py-1 rounded-md hover:bg-red-50 transition-colors"
              >
                <IconX size={14} stroke={2.5} /> Clear All Filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <FilterInput
                label="Search Process" icon={<IconSearch size={14} />}
                value={searchInput} onChange={handleSearchChange}
                placeholder="Search by process name..."
              />
            </div>

            {/* Workflow — options always come from the full unfiltered list */}
            <FilterAutocomplete
              label="Workflow" value={selectedWorkflow}
              onChange={setFilter(setSelectedWorkflow)}
              options={workflowOptions}
            />

            <FilterAutocomplete
              label="Status" value={selectedStatus}
              onChange={setFilter(setSelectedStatus)}
              options={statusOptions} getDisplayValue={getFilterDisplayValue}
            />

            <FilterAutocomplete
              label="Payment Mode" value={selectedPaymentMode}
              onChange={setFilter(setSelectedPaymentMode)}
              options={PAYMENT_MODE_OPTIONS} getDisplayValue={getFilterDisplayValue}
              placeholder="Select mode..."
            />

            {/* PO & Tag — options always come from the full unfiltered list */}
            <FilterAutocomplete
              label="PO Number" value={poSearch}
              onChange={setFilter(setPoSearch)}
              options={poOptions} placeholder="Type or select PO..."
            />

            <FilterAutocomplete
              label="Process Tag" value={tagSearch}
              onChange={setFilter(setTagSearch)}
              options={tagOptions} placeholder="Type or select Tag..."
            />

            {[
              { label: 'Created From',      value: createdFrom,  setter: setCreatedFrom  },
              { label: 'Created To',        value: createdTo,    setter: setCreatedTo    },
              { label: 'Payment Date From', value: paymentFrom,  setter: setPaymentFrom  },
              { label: 'Payment Date To',   value: paymentTo,    setter: setPaymentTo    },
            ].map(({ label, value, setter }) => (
              <div key={label} className="flex flex-col gap-1 w-full">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
                <input
                  type="date"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 bg-white text-gray-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all h-[36px]"
                  value={value}
                  onChange={(e) => { setter(e.target.value); setPaginationModel(p => ({ ...p, page: 0 })); }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── Data Grid ─────────────────────────────────────────────────────── */}
        <Box sx={{ height: '60vh', width: '100%', position: 'relative' }}>
          <DataGrid
            rows={dataRows}
            columns={columns}
            rowCount={total}
            // Server-side pagination: MUI delegates page control entirely to us
            paginationMode="server"
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            disableRowSelectionOnClick
            loading={fetching}
            getRowHeight={() => 'auto'}
            sx={gridStyles}
            slots={{
              noRowsOverlay: () => (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3 py-16">
                  <div className="p-4 bg-gray-50 rounded-full">
                    <IconPackage size={40} strokeWidth={1.5} className="text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-600">No processes found matching your filters</p>
                  <button
                    onClick={resetFilters}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-4 py-2 rounded-lg transition-colors"
                  >
                    Clear all filters
                  </button>
                </div>
              ),
            }}
          />
        </Box>

        {/* Result count */}
        {total > 0 && (
          <div className="mt-3 text-xs font-medium text-gray-500 text-right">
            Showing {paginationModel.page * paginationModel.pageSize + 1}–
            {Math.min((paginationModel.page + 1) * paginationModel.pageSize, total)} of {total} total processes
          </div>
        )}

      </CustomCard>
    </div>
  );
}
