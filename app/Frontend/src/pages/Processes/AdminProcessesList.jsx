import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import {
  Box,
  CircularProgress,
  Autocomplete,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import { toast } from 'react-toastify';
import {
  IconEye, IconSearch, IconRefresh, IconShieldCheck,
  IconUser, IconBriefcase, IconX, IconFilter,
  IconListNumbers, IconCreditCard,
} from '@tabler/icons-react';
import { GetAllProcessesForAdmin } from '../../common/Apis';
import CustomCard from '../../CustomComponents/CustomCard';

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_META = {
  IN_PROGRESS:    { label: 'In Progress', color: '#3b82f6', bg: '#eff6ff', border: '#93c5fd' },
  PENDING:        { label: 'Pending',     color: '#f59e0b', bg: '#fffbeb', border: '#fcd34d' },
  COMPLETED:      { label: 'Completed',   color: '#10b981', bg: '#f0fdf4', border: '#6ee7b7' },
REJECTED:       { label: 'Rejected',    color: '#ef4444', bg: '#fef2f2', border: '#fca5a5' },
  PO_NO_ATTACHED: { label: 'PO Attached', color: '#8b5cf6', bg: '#f5f3ff', border: '#c4b5fd' },
};

const PAGE_SIZE_OPTIONS = [10, 15, 25, 50, 100];
const EMPTY_OPTIONS = { workflows: ['All'], initiators: ['All'], paymentModes: ['All'], tags: ['All'], poNumbers: ['All'] };
const STATUS_OPTS = ['All', ...Object.keys(STATUS_META)];

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

// ─── Reusable Filter Components ───────────────────────────────────────────────
function FilterInput({ label, icon, value, onChange, placeholder }) {
  return (
    <div className="flex flex-col gap-1 w-full">
      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-100 transition-all h-[36px]">
        {icon && <span className="text-gray-400 flex-shrink-0">{icon}</span>}
        <input
          type="text"
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

function FilterAutocomplete({ label, value, onChange, options, placeholder = 'Type or select...' }) {
  return (
    <div className="flex flex-col gap-1 w-full">
      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      <Autocomplete
        freeSolo size="small" options={options} value={value}
        onChange={(_, newValue) => onChange(newValue || 'All')}
        onInputChange={(_, newInputValue) => onChange(newInputValue || 'All')}
        renderInput={(params) => (
          <TextField {...params} placeholder={placeholder} sx={{
            backgroundColor: 'white',
            '& .MuiOutlinedInput-root': {
              padding: '2px 8px', fontSize: '0.875rem', borderRadius: '0.5rem', minHeight: '36px',
              '& fieldset': { borderColor: '#e5e7eb' },
              '&:hover fieldset': { borderColor: '#d1d5db' },
              '&.Mui-focused fieldset': { borderColor: '#60a5fa', borderWidth: '1px' },
            },
          }} />
        )}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminProcessesList() {
  const navigate = useNavigate();

  // ── Data state ────────────────────────────────────────────────────────────
  const [rows, setRows]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(0);
  const [pageSize, setPageSize] = useState(15);
  const [loading, setLoading]   = useState(true);
  const [fetching, setFetching] = useState(false);

  // Summary cards
  const [summaryTotal,  setSummaryTotal]  = useState(0);
  const [summaryInProg, setSummaryInProg] = useState(0);

  // ── Dropdown options (from backend) ──────────────────────────────────────
  const [filterOptions, setFilterOptions] = useState(EMPTY_OPTIONS);

  // ── PO modal ──────────────────────────────────────────────────────────────
  const [viewPoModalOpen, setViewPoModalOpen] = useState(false);
  const [viewPoData, setViewPoData]           = useState([]);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [searchInput,  setSearchInput]  = useState('');
  const [search,       setSearch]       = useState('');
  const [workflow,     setWorkflow]     = useState('All');
  const [initiator,    setInitiator]    = useState('All');
  const [status,       setStatus]       = useState('All');
  const [poNumber,     setPoNumber]     = useState('All');
  const [paymentMode,  setPaymentMode]  = useState('All');
  const [tag,          setTag]          = useState('All');
  const [createdFrom,  setCreatedFrom]  = useState('');
  const [createdTo,    setCreatedTo]    = useState('');

  const debounceRef  = useRef(null);
  const skipFirst    = useRef(true);

  // ── Build query params ────────────────────────────────────────────────────
  const buildParams = useCallback((overrides = {}) => {
    const pg = overrides.pg  !== undefined ? overrides.pg  : page;
    const ps = overrides.ps  !== undefined ? overrides.ps  : pageSize;
    const sq = overrides.sq  !== undefined ? overrides.sq  : search;
    const wf = overrides.wf  !== undefined ? overrides.wf  : workflow;
    const ini= overrides.ini !== undefined ? overrides.ini : initiator;
    const st = overrides.st  !== undefined ? overrides.st  : status;
    const po = overrides.po  !== undefined ? overrides.po  : poNumber;
    const pm = overrides.pm  !== undefined ? overrides.pm  : paymentMode;
    const tg = overrides.tg  !== undefined ? overrides.tg  : tag;
    const cf = overrides.cf  !== undefined ? overrides.cf  : createdFrom;
    const ct = overrides.ct  !== undefined ? overrides.ct  : createdTo;

    return {
      page:    pg + 1,
      limit:   ps,
      showAll: true,
      ...(sq  && sq !== 'All'  ? { search: sq }          : {}),
      ...(wf  && wf !== 'All'  ? { workflowName: wf }    : {}),
      ...(ini && ini !== 'All' ? { initiatorName: ini }   : {}),
      ...(st  && st !== 'All'  ? { status: st }           : {}),
      ...(po  && po !== 'All'  ? { poNumber: po }         : {}),
      ...(pm  && pm !== 'All'  ? { paymentMode: pm }      : {}),
      ...(tg  && tg !== 'All'  ? { tag: tg }              : {}),
      ...(cf               ? { createdDateFrom: cf }      : {}),
      ...(ct               ? { createdDateTo: ct }        : {}),
    };
  }, [page, pageSize, search, workflow, initiator, status, poNumber, paymentMode, tag, createdFrom, createdTo]);

  // ── Core fetch ────────────────────────────────────────────────────────────
  // Every response now contains `filterOptions` reflecting the full matching
  // set (not just the current page), so dropdowns stay accurate at all times.
  const fetchData = useCallback(async (overrides = {}, isFirst = false) => {
    if (isFirst) setLoading(true);
    else         setFetching(true);

    try {
      const params = buildParams(overrides);
      const res    = await GetAllProcessesForAdmin(params);
      const data   = res?.data?.processes || res?.data?.data || [];
      const pagTot = res?.data?.total ?? res?.data?.pagination?.total ?? data.length;

      setRows(data.map((item, i) => ({
        id: item._id || item.processId || `a-${params.page}-${i}`,
        ...item,
      })));
      setTotal(pagTot);

      // Update dropdown options from the backend response.
      // The backend computes these across ALL matching records, not just this page.
      if (res?.data?.filterOptions) {
        setFilterOptions(res.data.filterOptions);
      }

      // Summary cards: only refresh on first load or manual refresh
      if (isFirst || overrides.isRefresh) {
        try {
          // Fetch summary counts with no filters (full dataset)
          const summaryRes = await GetAllProcessesForAdmin({ page: 1, limit: 1, showAll: true });
          const summaryData = summaryRes?.data?.processes || summaryRes?.data?.data || [];
          setSummaryTotal(summaryRes?.data?.total ?? summaryRes?.data?.pagination?.total ?? 0);
          // In-progress = everything that is not COMPLETED
          const inProgRes = await GetAllProcessesForAdmin({ page: 1, limit: 1, showAll: true, status: 'NOT_COMPLETED' });
          setSummaryInProg(inProgRes?.data?.total ?? inProgRes?.data?.pagination?.total ?? 0);
        } catch { /* non-critical */ }
      }
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.message || 'Failed to load processes');
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [buildParams]);

  // Initial load
  useEffect(() => { fetchData({}, true); }, []); // eslint-disable-line

  // Re-fetch whenever filters or pagination changes
  useEffect(() => {
    if (skipFirst.current) { skipFirst.current = false; return; }
    fetchData({ pg: page, ps: pageSize });
  }, [page, pageSize, search, workflow, initiator, status, poNumber, paymentMode, tag, createdFrom, createdTo]); // eslint-disable-line

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSearchChange = (v) => {
    setSearchInput(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(v); setPage(0); }, 500);
  };

  const resetFilters = () => {
    setSearchInput(''); setSearch('');
    setWorkflow('All'); setInitiator('All');
    setStatus('All');   setPoNumber('All');
    setPaymentMode('All'); setTag('All');
    setCreatedFrom(''); setCreatedTo('');
    setPage(0);
  };

  const handleView = (id) => navigate(`/process/view/${id}?adminView=true`);

  const hasActiveFilters =
    search || poNumber !== 'All' || workflow !== 'All' || initiator !== 'All' ||
    status !== 'All' || tag !== 'All' || paymentMode !== 'All' ||
    createdFrom || createdTo;

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns = [
    {
      field: 'processName', headerName: 'Process', flex: 1.5, minWidth: 220, disableColumnMenu: true,
      renderCell: (params) => (
        <div className="flex flex-col justify-center h-full py-2 gap-0.5">
          <span onClick={() => handleView(params.row.processId)}
            className="text-blue-600 cursor-pointer hover:underline font-semibold text-sm truncate" title={params.value}>
            {params.value || '—'}
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <IconUser size={11} className="text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-500 truncate">
              Initiator: {params.row.initiatorName || params.row.initiator?.username || '—'}
            </span>
          </div>
        </div>
      ),
    },
    {
      field: 'workflowName', headerName: 'Workflow', flex: 1, minWidth: 140, disableColumnMenu: true,
      renderCell: (params) => (
        <div className="flex items-center h-full">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded-md">
            <IconBriefcase size={12} className="text-gray-500" />
            <span className="text-xs font-medium text-gray-700">{params.value || params.row.workflow?.name || '—'}</span>
          </div>
        </div>
      ),
    },
    {
      field: 'status', headerName: 'Status', width: 130, disableColumnMenu: true,
      renderCell: (params) => {
        const meta = STATUS_META[params.value] || STATUS_META.PENDING;
        return (
          <div className="flex items-center h-full">
            <span className="px-2.5 py-1 text-[11px] uppercase tracking-wider rounded-md font-bold border whitespace-nowrap"
              style={{ color: meta.color, backgroundColor: meta.bg, borderColor: meta.border }}>
              {meta.label || params.value}
            </span>
          </div>
        );
      },
    },
    {
      field: 'poNumbers', headerName: 'PO Numbers', width: 160, disableColumnMenu: true,
      renderCell: (params) => {
        const pos = params.value || [];
        if (!Array.isArray(pos) || pos.length === 0)
          return <span className="text-xs font-medium text-gray-400 flex items-center h-full">—</span>;
        const visible  = pos.slice(0, 1);
        const hidden   = pos.length - visible.length;
        return (
          <div className="flex items-center gap-1.5 w-full h-full py-1">
            {visible.map((po, idx) => (
              <div key={idx} className="flex items-center justify-center bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold px-2 py-1 rounded shadow-sm">
                <span className="text-[10px] text-slate-400 mr-0.5">#</span>{po}
              </div>
            ))}
            {hidden > 0 && (
              <button onClick={(e) => { e.stopPropagation(); setViewPoData(pos); setViewPoModalOpen(true); }}
                className="flex items-center justify-center bg-blue-50 text-blue-600 border border-blue-200 text-xs font-semibold px-2 py-1 rounded shadow-sm hover:bg-blue-600 hover:text-white transition-colors cursor-pointer">
                +{hidden} More
              </button>
            )}
          </div>
        );
      },
    },
    {
      field: 'payment', headerName: 'Payment', width: 150, disableColumnMenu: true,
      renderCell: (params) => (
        <div className="flex flex-col justify-center h-full py-2">
          {params.row.paymentMode ? (
            <div className="flex items-center gap-1.5 mb-0.5">
              <IconCreditCard size={12} className="text-emerald-500" />
              <span className="text-xs font-semibold text-gray-700">{params.row.paymentMode}</span>
            </div>
          ) : <span className="text-xs text-gray-400 mb-0.5">No Payment Info</span>}
          {params.row.paymentDate && (
            <span className="text-[11px] text-gray-500">{moment(params.row.paymentDate).format('DD MMM YYYY')}</span>
          )}
        </div>
      ),
    },
    {
      field: 'createdAt', headerName: 'Created Date', width: 140, disableColumnMenu: true,
      renderCell: (params) => (
        <div className="flex flex-col justify-center h-full py-2">
          <span className="text-xs text-gray-700 font-medium">{params.value ? moment(params.value).format('DD MMM YYYY') : '—'}</span>
          <span className="text-[11px] text-gray-400">{params.value ? moment(params.value).format('hh:mm A') : ''}</span>
        </div>
      ),
    },
    {
      field: 'actions', headerName: '', width: 60, sortable: false, disableColumnMenu: true,
      renderCell: (params) => (
        <div className="flex items-center justify-center h-full w-full">
          <button onClick={() => handleView(params.row.processId)}
            className="p-1.5 bg-blue-600 hover:bg-blue-700 transition-all duration-150 rounded-md shadow-sm focus:outline-none" title="View Process">
            <IconEye size={16} color="white" />
          </button>
        </div>
      ),
    },
  ];

  // ── Loading state ─────────────────────────────────────────────────────────
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

        {/* Summary & Actions Row */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm">
            <span className="text-2xl font-bold text-gray-800 leading-none">{summaryTotal}</span>
            <span className="text-xs text-gray-500 leading-tight">Total<br />Processes</span>
          </div>
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
            <span className="text-2xl font-bold text-blue-700 leading-none">{summaryInProg}</span>
            <span className="text-xs text-blue-500 leading-tight">In<br />Progress</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm">
              <IconListNumbers size={16} className="text-gray-400" />
              <label htmlFor="pageSizeSelect" className="text-xs font-semibold text-gray-600">Per Page:</label>
              <select id="pageSizeSelect" value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
                className="text-xs font-medium bg-transparent text-gray-800 outline-none cursor-pointer focus:ring-0">
                {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <button onClick={() => { setPage(0); fetchData({ pg: 0, isRefresh: true }); }}
              disabled={fetching}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50">
              <IconRefresh size={14} className={fetching ? 'animate-spin' : ''} />
              Refresh Data
            </button>
          </div>
        </div>

        {/* Filter Panel */}
        <div className="mb-5 p-4 bg-gray-50 border border-gray-200 rounded-xl shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <IconFilter size={16} className="text-blue-600" />
            <span className="text-sm font-bold text-gray-800">Filter Processes</span>
            {hasActiveFilters && (
              <button onClick={resetFilters}
                className="ml-auto flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-700 px-2.5 py-1 rounded-md hover:bg-red-50 transition-colors">
                <IconX size={14} stroke={2.5} /> Clear All Filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <div className="xl:col-span-2">
              <FilterInput label="Search Process" icon={<IconSearch size={14} />}
                value={searchInput} onChange={handleSearchChange} placeholder="Search by process name..." />
            </div>

            {/* All dropdown options come from backend filterOptions */}
            <FilterAutocomplete label="Workflow"     value={workflow}    onChange={(v) => { setWorkflow(v);    setPage(0); }} options={filterOptions.workflows} />
            <FilterAutocomplete label="Initiator"    value={initiator}   onChange={(v) => { setInitiator(v);  setPage(0); }} options={filterOptions.initiators} />
            <FilterAutocomplete label="Status"       value={status}      onChange={(v) => { setStatus(v);     setPage(0); }} options={STATUS_OPTS} />
            <FilterAutocomplete label="PO Number"    value={poNumber}    onChange={(v) => { setPoNumber(v);   setPage(0); }} options={filterOptions.poNumbers}   placeholder="Select or type PO..." />
            <FilterAutocomplete label="Payment Mode" value={paymentMode} onChange={(v) => { setPaymentMode(v);setPage(0); }} options={filterOptions.paymentModes} placeholder="Select or type mode..." />
            <FilterAutocomplete label="Process Tag"  value={tag}         onChange={(v) => { setTag(v);        setPage(0); }} options={filterOptions.tags} />

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Created From</label>
              <input type="date"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all h-[36px]"
                value={createdFrom} onChange={(e) => { setCreatedFrom(e.target.value); setPage(0); }} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Created To</label>
              <input type="date"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all h-[36px]"
                value={createdTo} onChange={(e) => { setCreatedTo(e.target.value); setPage(0); }} />
            </div>
          </div>
        </div>

        {/* Data Grid */}
        <Box sx={{ height: '60vh', width: '100%', position: 'relative' }}>
          <DataGrid
            rows={rows} columns={columns}
            rowCount={total}
            paginationMode="server"
            paginationModel={{ page, pageSize }}
            onPaginationModelChange={(model) => {
              if (model.pageSize !== pageSize) { setPageSize(model.pageSize); setPage(0); }
              else setPage(model.page);
            }}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            disableRowSelectionOnClick
            loading={fetching}
            getRowHeight={() => 'auto'}
            sx={gridStyles}
            slots={{
              noRowsOverlay: () => (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3 py-16">
                  <div className="p-4 bg-gray-50 rounded-full">
                    <IconShieldCheck size={40} strokeWidth={1.5} className="text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-600">No processes found matching your filters</p>
                  <button onClick={resetFilters}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-4 py-2 rounded-lg transition-colors">
                    Clear all filters
                  </button>
                </div>
              ),
            }}
          />
        </Box>

        {total > 0 && (
          <div className="mt-3 text-xs font-medium text-gray-500 text-right">
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total} total processes
          </div>
        )}
      </CustomCard>

      {/* PO Modal */}
      <Dialog open={viewPoModalOpen} onClose={() => setViewPoModalOpen(false)}
        PaperProps={{ sx: { borderRadius: '1rem', minWidth: '320px' } }}>
        <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-slate-800">Attached POs</span>
            <span className="text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full text-xs font-bold">{viewPoData.length}</span>
          </div>
          <IconButton onClick={() => setViewPoModalOpen(false)} size="small" sx={{ color: '#94a3b8' }}>
            <IconX size={18} stroke={2.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <div className="p-4 max-h-[350px] overflow-y-auto bg-white">
            <div className="flex flex-col gap-2.5">
              {viewPoData.map((po, idx) => (
                <div key={idx} className="flex justify-between items-center bg-slate-50 text-slate-700 border border-slate-200 text-sm font-bold px-4 py-3 rounded-xl">
                  <span className="text-slate-400 font-medium mr-2 text-xs uppercase tracking-wider">Entry #{idx + 1}</span>
                  <span className="tracking-wide">{po}</span>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
