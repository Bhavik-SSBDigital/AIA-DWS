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
  IconButton 
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import { toast } from 'react-toastify';
import {
  IconEye,
  IconSearch,
  IconRefresh,
  IconShieldCheck,
  IconUser,
  IconBriefcase,
  IconX,
  IconFilter,
  IconListNumbers,
  IconCreditCard,
  IconPaperclip,
  IconMail,
  IconPlus,
  IconTrash
} from '@tabler/icons-react';
import { GetCompletedProcessList, AttachPoNumbers } from '../../common/Apis';
import CustomCard from '../../CustomComponents/CustomCard';
import CustomModal from '../../CustomComponents/CustomModal';
import CustomButton from '../../CustomComponents/CustomButton';
import EmailManagerModal from './EmailManagerModal';

// ─── Constants & Styles ────────────────────────────────────────────────────────
const STATUS_META = {
  IN_PROGRESS:    { label: 'In Progress', color: '#3b82f6', bg: '#eff6ff', border: '#93c5fd' },
  PENDING:        { label: 'Pending',     color: '#f59e0b', bg: '#fffbeb', border: '#fcd34d' },
  COMPLETED:      { label: 'Completed',   color: '#10b981', bg: '#f0fdf4', border: '#6ee7b7' },
REJECTED:       { label: 'Rejected',    color: '#ef4444', bg: '#fef2f2', border: '#fca5a5' },
  PO_NO_ATTACHED: { label: 'PO Attached', color: '#8b5cf6', bg: '#f5f3ff', border: '#c4b5fd' },
};

const PAGE_SIZE_OPTIONS = [10, 15, 25, 50, 100];

const gridStyles = {
  backgroundColor: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: '0.5rem',
  boxShadow: '0 1px 3px 0 rgba(0,0,0,0.06)',
  '& .MuiDataGrid-columnHeaders': {
    backgroundColor: '#f8fafc',
    borderBottom: '1px solid #e5e7eb',
    color: '#374151',
    fontSize: '0.8125rem',
    fontWeight: 600,
  },
  '& .MuiDataGrid-row': {
    borderBottom: '1px solid #f1f5f9',
    transition: 'background-color 100ms',
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

// ─── Filter Components ─────────────────────────────────────────────────────────
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

function FilterAutocomplete({ label, value, onChange, options, placeholder = "Type or select..." }) {
  return (
    <div className="flex flex-col gap-1 w-full">
      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      <Autocomplete
        freeSolo
        size="small"
        options={options}
        value={value}
        onChange={(event, newValue) => onChange(newValue || 'All')}
        onInputChange={(event, newInputValue) => onChange(newInputValue || 'All')}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={placeholder}
            sx={{
              backgroundColor: 'white',
              '& .MuiOutlinedInput-root': {
                padding: '2px 8px',
                fontSize: '0.875rem',
                borderRadius: '0.5rem',
                minHeight: '36px',
                '& fieldset': { borderColor: '#e5e7eb' },
                '&:hover fieldset': { borderColor: '#d1d5db' },
                '&.Mui-focused fieldset': { borderColor: '#60a5fa', borderWidth: '1px' },
              }
            }}
          />
        )}
      />
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function CompletedProcesses() {
  const navigate = useNavigate();

  // Data Grid State
  const [rows, setRows]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(0);
  const [pageSize, setPageSize] = useState(15);
  const [loading, setLoading]   = useState(true);
  const [fetching, setFetching] = useState(false);

  // Filters State
  const [searchInput, setSearchInput]   = useState('');
  const [search, setSearch]             = useState('');
  const [workflow, setWorkflow]         = useState('All');
  const [initiator, setInitiator]       = useState('All');
  const [status, setStatus]             = useState('All');
  const [poNumber, setPoNumber]         = useState('All');
  const [paymentMode, setPaymentMode]   = useState('All');
  const [tag, setTag]                   = useState('All');
  const [createdFrom, setCreatedFrom]   = useState('');
  const [createdTo, setCreatedTo]       = useState('');

  // Dropdown Options State
  const [workflowOpts, setWorkflowOpts]       = useState(['All']);
  const [initiatorOpts, setInitiatorOpts]     = useState(['All']);
  const [tagOpts, setTagOpts]                 = useState(['All']);
  const [poOpts, setPoOpts]                   = useState(['All']);
  const [paymentModeOpts, setPaymentModeOpts] = useState(['All']);
  const [statusOpts, setStatusOpts]           = useState(['All']);

  // Summary Metrics State
  const [summaryTotal, setSummaryTotal]         = useState(0);
  const [summaryCompleted, setSummaryCompleted] = useState(0);

  // Modals State
  const [viewPoModalOpen, setViewPoModalOpen] = useState(false);
  const [viewPoData, setViewPoData]           = useState([]);
  
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [selectedProcessId, setSelectedProcessId] = useState(null);
  const [submittingPo, setSubmittingPo] = useState(false);
  const [poTags, setPoTags] = useState([]);
  const [inputValue, setInputValue] = useState('');

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [selectedEmailProcess, setSelectedEmailProcess] = useState(null);

  const debounceAll = useRef(null);
  const skipFirst   = useRef(true);

  // ─── Core Data Fetching Logic ────────────────────────────────────────────────
  const fetchData = useCallback(async (overrides = {}, isFirst = false) => {
    if (isFirst) setLoading(true);
    else         setFetching(true);

    const pg  = overrides.pg   ?? page;
    const ps  = overrides.ps   ?? pageSize;
    const sq  = overrides.sq   ?? search;
    const wf  = overrides.wf   ?? workflow;
    const ini = overrides.ini  ?? initiator;
    const st  = overrides.st   ?? status;
    const po  = overrides.po   ?? poNumber;
    const pm  = overrides.pm   ?? paymentMode;
    const tg  = overrides.tg   ?? tag;
    const cf  = overrides.cf   ?? createdFrom;
    const ct  = overrides.ct   ?? createdTo;

    try {
      const params = {
        page: pg, 
        pageSize: ps,
        ...(sq  && { search: sq }),
        ...(wf  !== 'All' && { workflowName: wf }),
        ...(ini !== 'All' && { initiatorName: ini }),
        ...(st  !== 'All' && { status: st }),
        ...(po  !== 'All' && { poSearch: po }),
        ...(pm  !== 'All' && { paymentMode: pm }),
        ...(tg  !== 'All' && { tagSearch: tg }),
        ...(cf  && { createdDateFrom: cf }),
        ...(ct  && { createdDateTo: ct }),
      };

      const res = await GetCompletedProcessList({ params });
      
      const data = res?.data?.data || [];
      const pagTotal = res?.data?.pagination?.total || data.length;

      setRows(data.map((item, i) => ({ id: item._id || item.processId || `p-${pg}-${i}`, ...item })));
      setTotal(pagTotal);

      // Populate dropdown options on initial load
      if (isFirst || overrides.isRefresh) {
        try {
          const optRes  = await GetCompletedProcessList({ params: { page: 0, pageSize: 1000 } });
          const optData = optRes?.data?.data || [];
          
          setWorkflowOpts(['All', ...new Set(optData.map((p) => p.workflowName).filter(Boolean))]);
          setInitiatorOpts(['All', ...new Set(optData.map((p) => p.initiatorName || p.initiatorUsername).filter(Boolean))]);
          setStatusOpts(['All', ...new Set(optData.map((p) => p.status).filter(Boolean))]);
          setPaymentModeOpts(['All', ...new Set(optData.map((p) => p.paymentMode).filter(Boolean))]);
          
          const allTags = optData.flatMap((p) => p.tags || []);
          setTagOpts(['All', ...new Set(allTags.filter(Boolean))]);

          const allPos = optData.flatMap((p) => p.poNumbers || []);
          setPoOpts(['All', ...new Set(allPos.filter(Boolean))]);

          setSummaryTotal(optRes?.data?.pagination?.total || optData.length);
          setSummaryCompleted(optData.filter((p) => p.status === 'COMPLETED' || p.status === 'PO_NO_ATTACHED').length);
        } catch (e) { 
          console.warn("Failed to fetch summary data", e);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.message || 'Failed to load processes');
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [page, pageSize, search, workflow, initiator, status, poNumber, paymentMode, tag, createdFrom, createdTo]);

  useEffect(() => {
    fetchData({}, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (skipFirst.current) { skipFirst.current = false; return; }
    fetchData({ pg: page, ps: pageSize });
  }, [page, pageSize, search, workflow, initiator, status, poNumber, paymentMode, tag, createdFrom, createdTo, fetchData]);

  // ─── Event Handlers ──────────────────────────────────────────────────────────
  const handleSearchChange = (v) => {
    setSearchInput(v);
    clearTimeout(debounceAll.current);
    debounceAll.current = setTimeout(() => { setSearch(v); setPage(0); }, 500);
  };

  const resetFilters = () => {
    setSearchInput(''); setSearch(''); 
    setWorkflow('All'); setInitiator('All'); 
    setStatus('All'); setPoNumber('All'); 
    setPaymentMode('All'); setTag('All');
    setCreatedFrom(''); setCreatedTo('');
    setPage(0);
  };

  const handleView = (id) => navigate(`/process/view/${id}?completed=true`);

  const handleOpenEmailModal = (process) => {
    setSelectedEmailProcess(process);
    setEmailModalOpen(true);
  };

  const handleOpenPoModal = (processId) => {
    setSelectedProcessId(processId);
    setPoTags([]);
    setInputValue('');
    setPoModalOpen(true);
  };

  const handleAddSinglePo = () => {
    const trimmedInput = inputValue.trim();
    if (!trimmedInput) return;
    if (!/^\d{10}$/.test(trimmedInput)) { toast.warning("PO Number must be exactly 10 digits."); return; }
    if (poTags.includes(trimmedInput)) { toast.warning("This PO Number is already added."); return; }
    setPoTags(prev => [...prev, trimmedInput]);
    setInputValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSinglePo();
    }
  };

  const removeTag = (tagToRemove) => {
    setPoTags(poTags.filter(t => t !== tagToRemove));
  };

  const handleAttachPo = async () => {
    let finalTags = [...poTags];
    const trimmedInput = inputValue.trim();

    if (trimmedInput) {
      if (!/^\d{10}$/.test(trimmedInput)) { toast.warning("The pending PO Number must be exactly 10 digits."); return; }
      if (!poTags.includes(trimmedInput)) { finalTags.push(trimmedInput); }
    }

    if (finalTags.length === 0) { toast.warning("Please add at least one 10-digit PO Number."); return; }
    
    setSubmittingPo(true);
    try {
      await AttachPoNumbers(selectedProcessId, finalTags);
      toast.success(`${finalTags.length} PO Number(s) attached successfully!`);
      setPoTags([]);
      setInputValue('');
      setPoModalOpen(false);
      fetchData({ pg: page, ps: pageSize }, false); 
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to attach PO Numbers");
    } finally {
      setSubmittingPo(false);
    }
  };

  // ─── Columns Definition ──────────────────────────────────────────────────────
  const columns = [
    {
      field: 'processName',
      headerName: 'Process',
      flex: 1.5,
      minWidth: 220,
      disableColumnMenu: true,
      renderCell: (params) => (
        <div className="flex flex-col justify-center h-full py-2 gap-0.5">
          <span
            onClick={() => handleView(params.row.processId)}
            className="text-blue-600 cursor-pointer hover:underline font-semibold text-sm truncate"
            title={params.value}
          >
            {params.value || '—'}
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <IconUser size={11} className="text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-500 truncate">Initiator: {params.row.initiatorName || params.row.initiatorUsername || '—'}</span>
          </div>
        </div>
      ),
    },
    {
      field: 'workflowName',
      headerName: 'Workflow',
      flex: 1,
      minWidth: 140,
      disableColumnMenu: true,
      renderCell: (params) => (
        <div className="flex items-center h-full">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded-md">
             <IconBriefcase size={12} className="text-gray-500" />
             <span className="text-xs font-medium text-gray-700">{params.value || '—'}</span>
          </div>
        </div>
      )
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 130,
      disableColumnMenu: true,
      renderCell: (params) => {
        const meta = STATUS_META[params.value] || { label: params.value?.replace(/_/g, ' '), color: '#374151', bg: '#f3f4f6', border: '#e5e7eb' };
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
      field: 'poNumbers',
      headerName: 'PO Numbers',
      width: 160,
      disableColumnMenu: true,
      renderCell: (params) => {
        const pos = params.value || [];
        if (!Array.isArray(pos) || pos.length === 0) {
          return <span className="text-xs font-medium text-gray-400 flex items-center h-full">—</span>;
        }

        const visiblePos = pos.slice(0, 1);
        const hiddenCount = pos.length - visiblePos.length;

        return (
          <div className="flex items-center gap-1.5 w-full h-full py-1">
            {visiblePos.map((po, idx) => (
              <div 
                key={idx} 
                className="flex items-center justify-center bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold px-2 py-1 rounded shadow-sm"
              >
                <span className="text-[10px] text-slate-400 mr-0.5">#</span>{po}
              </div>
            ))}
            
            {hiddenCount > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setViewPoData(pos);
                  setViewPoModalOpen(true);
                }}
                className="flex items-center justify-center bg-blue-50 text-blue-600 border border-blue-200 text-xs font-semibold px-2 py-1 rounded shadow-sm hover:bg-blue-600 hover:text-white transition-colors cursor-pointer"
              >
                +{hiddenCount} More
              </button>
            )}
          </div>
        );
      }
    },
    {
      field: 'payment',
      headerName: 'Payment',
      width: 150,
      disableColumnMenu: true,
      renderCell: (params) => (
        <div className="flex flex-col justify-center h-full py-2">
          {params.row.paymentMode ? (
            <div className="flex items-center gap-1.5 mb-0.5">
              <IconCreditCard size={12} className="text-emerald-500" />
              <span className="text-xs font-semibold text-gray-700">{params.row.paymentMode}</span>
            </div>
          ) : (
             <span className="text-xs text-gray-400 mb-0.5">No Payment Info</span>
          )}
          {params.row.paymentDate && (
             <span className="text-[11px] text-gray-500">
               {moment(params.row.paymentDate).format('DD MMM YYYY')}
             </span>
          )}
        </div>
      ),
    },
    {
      field: 'createdAt',
      headerName: 'Created Date',
      width: 140,
      disableColumnMenu: true,
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
      width: 140,
      sortable: false,
      disableColumnMenu: true,
      renderCell: (params) => (
        <div className="flex items-center gap-2 h-full w-full">
          <button
            onClick={() => handleView(params.row.processId)}
            className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white transition-all duration-150 rounded-md shadow-sm focus:outline-none"
            title="View Process"
          >
            <IconEye size={16} />
          </button>
          
          {(params.row.status === 'COMPLETED' || params.row.status === 'PO_NO_ATTACHED') && (
            <button
              className="p-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-md shadow-sm transition-colors"
              onClick={() => handleOpenPoModal(params.row.processId)}
              title="Add PO Numbers"
            >
              <IconPaperclip size={16} />
            </button>
          )}
          
          {(params.row.status === 'COMPLETED' || params.row.status === 'PO_NO_ATTACHED') && (
            <button
              className="p-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-md shadow-sm transition-colors"
              onClick={() => handleOpenEmailModal(params.row)}
              title="Send Email"
            >
              <IconMail size={16} />
            </button>
          )}
        </div>
      ),
    },
  ];

  // ─── Loading State ───────────────────────────────────────────────────────────
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

  // ─── Active Filters Check ────────────────────────────────────────────────────
  const hasActiveFilters = search || poNumber !== 'All' || workflow !== 'All' || initiator !== 'All' || 
                           status !== 'All' || tag !== 'All' || paymentMode !== 'All' || 
                           createdFrom || createdTo;

  return (
    <div className="animate-fade-in">
      <CustomCard>
        {/* Summary & Actions Row */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm">
            <span className="text-2xl font-bold text-gray-800 leading-none">{summaryTotal}</span>
            <span className="text-xs text-gray-500 leading-tight">Total<br />Processes</span>
          </div>
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
            <span className="text-2xl font-bold text-emerald-700 leading-none">{summaryCompleted}</span>
            <span className="text-xs text-emerald-600 leading-tight">Ready /<br />Completed</span>
          </div>
          
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm">
              <IconListNumbers size={16} className="text-gray-400" />
              <label htmlFor="pageSizeSelect" className="text-xs font-semibold text-gray-600">Per Page:</label>
              <select
                id="pageSizeSelect"
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
                className="text-xs font-medium bg-transparent text-gray-800 outline-none cursor-pointer focus:ring-0"
              >
                {PAGE_SIZE_OPTIONS.map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => { setPage(0); fetchData({ pg: 0, isRefresh: true }, false); }}
              disabled={fetching}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
            >
              <IconRefresh size={14} className={fetching ? 'animate-spin' : ''} />
              Refresh Data
            </button>
          </div>
        </div>

        {/* ✅ Advanced Filters Panel – exactly as in AdminProcessesList */}
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
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {/* Row 1 */}
            <div className="xl:col-span-2">
              <FilterInput
                label="Search Process"
                icon={<IconSearch size={14} />}
                value={searchInput}
                onChange={handleSearchChange}
                placeholder="Search by process name..."
              />
            </div>
            
            <FilterAutocomplete
              label="Workflow"
              value={workflow}
              onChange={(v) => { setWorkflow(v); setPage(0); }}
              options={workflowOpts}
            />
            
            <FilterAutocomplete
              label="Initiator"
              value={initiator}
              onChange={(v) => { setInitiator(v); setPage(0); }}
              options={initiatorOpts}
            />

            <FilterAutocomplete
              label="Status"
              value={status}
              onChange={(v) => { setStatus(v); setPage(0); }}
              options={statusOpts}
            />

            {/* Row 2 */}
            <FilterAutocomplete
              label="PO Number"
              value={poNumber}
              onChange={(v) => { setPoNumber(v); setPage(0); }}
              options={poOpts}
              placeholder="Select or type PO..."
            />

            <FilterAutocomplete
              label="Payment Mode"
              value={paymentMode}
              onChange={(v) => { setPaymentMode(v); setPage(0); }}
              options={paymentModeOpts}
              placeholder="Select or type mode..."
            />

            <FilterAutocomplete
              label="Process Tag"
              value={tag}
              onChange={(v) => { setTag(v); setPage(0); }}
              options={tagOpts}
            />
            
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Created From</label>
              <input type="date"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all h-[36px]"
                value={createdFrom}
                onChange={(e) => { setCreatedFrom(e.target.value); setPage(0); }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Created To</label>
              <input type="date"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all h-[36px]"
                value={createdTo}
                onChange={(e) => { setCreatedTo(e.target.value); setPage(0); }}
              />
            </div>
          </div>
        </div>

        {/* Data Grid */}
        <Box sx={{ height: '60vh', width: '100%', position: 'relative' }}>
          <DataGrid
            rows={rows}
            columns={columns}
            rowCount={total}
            paginationMode="server"
            paginationModel={{ page: page, pageSize: pageSize }}
            onPaginationModelChange={(model) => { 
              if (model.pageSize !== pageSize) {
                setPageSize(model.pageSize);
                setPage(0);
              } else {
                setPage(model.page);
              }
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

        {/* Pagination Status Text */}
        {total > 0 && (
          <div className="mt-3 text-xs font-medium text-gray-500 text-right">
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total} total processes
          </div>
        )}
      </CustomCard>

      {/* --- Attach New PO Numbers Modal --- */}
      {poModalOpen && (
        <CustomModal 
          isOpen={poModalOpen} 
          onClose={() => setPoModalOpen(false)} 
          className="max-w-xl w-full rounded-2xl"
        >
          <div className="p-0 bg-white rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2.5 rounded-xl text-blue-600 shadow-sm">
                  <IconPaperclip size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-800 leading-tight">Add PO Numbers</h2>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-0.5">
                    Process ID: <span className="text-gray-700">{selectedProcessId}</span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setPoModalOpen(false)}
                className="p-2 bg-white border border-gray-200 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all shadow-sm"
              >
                <IconX size={20} stroke={2.5} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 flex justify-between">
                  <span>Enter PO Number</span>
                  <span className="text-[11px] font-semibold text-gray-400">Exact 10 digits required</span>
                </label>
                
                <div className="flex gap-3">
                  <input
                    id="po-input-field"
                    value={inputValue}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '' || /^\d{0,10}$/.test(val)) {
                        setInputValue(val);
                      }
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Type 10-digit PO Number..."
                    className="flex-1 bg-white border border-gray-300 outline-none text-sm text-gray-700 py-2.5 px-4 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
                  />
                  <button
                    onClick={handleAddSinglePo}
                    disabled={inputValue.trim().length !== 10}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <IconPlus size={18} stroke={2.5} /> Add
                  </button>
                </div>
              </div>

              {poTags.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Added POs ({poTags.length})
                  </h3>
                  <div className="bg-gray-50 border border-gray-200 rounded-xl max-h-[180px] overflow-y-auto p-2 space-y-2">
                    {poTags.map(tag => (
                      <div 
                        key={tag} 
                        className="flex justify-between items-center bg-white border border-gray-200 py-2 px-3 rounded-lg shadow-sm animate-in fade-in zoom-in-95 duration-200"
                      >
                        <span className="text-sm font-bold text-gray-700">{tag}</span>
                        <button 
                          onClick={() => removeTag(tag)} 
                          className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-md transition-colors"
                          title="Remove PO"
                        >
                          <IconTrash size={16} stroke={2} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <CustomButton 
                variant="secondary" 
                text="Cancel" 
                className="bg-white border-gray-300 text-gray-700 hover:bg-gray-100 px-6 py-2 shadow-sm"
                click={() => setPoModalOpen(false)} 
              />
              <CustomButton 
                variant="primary" 
                text={submittingPo ? "Saving..." : "Save PO Numbers"} 
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 shadow-md"
                click={handleAttachPo} 
                disabled={submittingPo || (poTags.length === 0 && !/^\d{10}$/.test(inputValue.trim()))} 
              />
            </div>
          </div>
        </CustomModal>
      )}

      {/* View All POs Modal */}
      <Dialog 
        open={viewPoModalOpen} 
        onClose={() => setViewPoModalOpen(false)}
        PaperProps={{ sx: { borderRadius: '1rem', minWidth: '320px' } }}
      >
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
                <div
                  key={idx}
                  className="flex justify-between items-center bg-slate-50 text-slate-700 border border-slate-200 text-sm font-bold px-4 py-3 rounded-xl"
                >
                  <span className="text-slate-400 font-medium mr-2 text-xs uppercase tracking-wider">Entry #{idx + 1}</span>
                  <span className="tracking-wide">{po}</span>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Email Manager Modal */}
      {emailModalOpen && selectedEmailProcess && (
        <EmailManagerModal
          isOpen={emailModalOpen}
          onClose={() => setEmailModalOpen(false)}
          processId={selectedEmailProcess.processId}
          processName={selectedEmailProcess.processName}
        />
      )}
    </div>
  );
}