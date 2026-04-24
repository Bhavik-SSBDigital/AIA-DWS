import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import {
  Box, CircularProgress, Tabs, Tab, Autocomplete, TextField,
  Dialog, DialogTitle, DialogContent, IconButton
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import { toast } from 'react-toastify';
import {
  IconEye, IconSearch, IconRefresh, IconLoader2, IconCircleCheck,
  IconPackage, IconCalendar, IconX, IconShieldCheck, IconFilter, IconListNumbers,
  IconPaperclip, IconMail, IconPlus, IconTrash
} from '@tabler/icons-react';
import { GetCompletedProcessList, AttachPoNumbers } from '../../common/Apis';
import CustomCard from '../../CustomComponents/CustomCard';
import CustomModal from '../../CustomComponents/CustomModal';
import CustomButton from '../../CustomComponents/CustomButton';
import EmailManagerModal from '../Processes/EmailManagerModal';

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_META = {
  IN_PROGRESS:    { label: 'In Progress', color: '#3b82f6', bg: '#eff6ff', border: '#93c5fd' },
  PENDING:        { label: 'Pending',     color: '#f59e0b', bg: '#fffbeb', border: '#fcd34d' },
  COMPLETED:      { label: 'Completed',   color: '#10b981', bg: '#f0fdf4', border: '#6ee7b7' },
  REJECTED:       { label: 'Rejected',    color: '#ef4444', bg: '#fef2f2', border: '#fca5a5' },
  PO_NO_ATTACHED: { label: 'PO Attached', color: '#8b5cf6', bg: '#f5f3ff', border: '#c4b5fd' },
};
const PAYMENT_MODE_OPTIONS = ['All', 'ON_APPROVAL', 'ON_DATE'];
const PAGE_SIZE_OPTIONS    = [10, 15, 25, 50, 100];
const EMPTY_OPTIONS = { workflows: ['All'], initiators: ['All'], paymentModes: ['All'], tags: ['All'], poNumbers: ['All'] };

const gridStyles = {
  backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem',
  boxShadow: '0 1px 3px 0 rgba(0,0,0,0.06)',
  '& .MuiDataGrid-columnHeaders': { backgroundColor: '#f8fafc', borderBottom: '1px solid #e5e7eb', color: '#374151', fontSize: '0.8125rem', fontWeight: 600 },
  '& .MuiDataGrid-row': { borderBottom: '1px solid #f1f5f9', transition: 'background-color 100ms', '&:hover': { backgroundColor: '#f8fafc' } },
  '& .MuiDataGrid-cell': { borderBottom: 'none', '&:focus': { outline: 'none' }, '&:focus-within': { outline: 'none' } },
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
        <input type="text"
          className="flex-1 text-sm outline-none text-gray-700 placeholder-gray-400 bg-transparent min-w-0"
          placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
        {value && (
          <button onClick={() => onChange('')} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
            <IconX size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function FilterAutocomplete({ label, value, onChange, options, placeholder = 'Type or select...', getDisplayValue = (v) => String(v) }) {
  return (
    <div className="flex flex-col gap-1 w-full">
      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      <Autocomplete
        freeSolo size="small" options={options}
        getOptionLabel={(o) => (o ? getDisplayValue(o) : '')}
        value={value === 'All' ? null : value}
        onChange={(_, nv) => onChange(nv || 'All')}
        onInputChange={(_, nv, reason) => { if (reason === 'input' || reason === 'clear') onChange(nv || 'All'); }}
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
export default function InitiatedProcesses() {
  const navigate = useNavigate();
  const isAdmin      = sessionStorage.getItem('isAdmin')     === 'true';
  const isRootUser   = sessionStorage.getItem('specialUser') === 'true' || sessionStorage.getItem('isRootUser') === 'true';
  const isPrivileged = isAdmin || isRootUser;

  // ── Pagination & grid ─────────────────────────────────────────────────────
  const [rows, setRows]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(0);
  const [pageSize, setPageSize] = useState(15);
  const [loading, setLoading]   = useState(true);
  const [fetching, setFetching] = useState(false);

  // ── Summary counts ────────────────────────────────────────────────────────
  const [ownTotal,     setOwnTotal]     = useState(0);
  const [ownInProg,    setOwnInProg]    = useState(0);
  const [ownCompleted, setOwnCompleted] = useState(0);
  const [allTotal,     setAllTotal]     = useState(0);
  const [allInProg,    setAllInProg]    = useState(0);
  const [allCompleted, setAllCompleted] = useState(0);

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(0);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [searchInput,         setSearchInput]         = useState('');
  const [search,              setSearch]              = useState('');
  const [poSearch,            setPoSearch]            = useState('All');
  const [tagSearch,           setTagSearch]           = useState('All');
  const [selectedWorkflow,    setSelectedWorkflow]    = useState('All');
  const [selectedInitiator,   setSelectedInitiator]   = useState('All');
  const [selectedStatus,      setSelectedStatus]      = useState('All');
  const [selectedPaymentMode, setSelectedPaymentMode] = useState('All');
  const [createdFrom,         setCreatedFrom]         = useState('');
  const [createdTo,           setCreatedTo]           = useState('');
  const [paymentFrom,         setPaymentFrom]         = useState('');
  const [paymentTo,           setPaymentTo]           = useState('');

  // ── Modals State ──────────────────────────────────────────────────────────
  const [viewPoModalOpen, setViewPoModalOpen] = useState(false);
  const [viewPoData, setViewPoData]           = useState([]);
  
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [selectedProcessId, setSelectedProcessId] = useState(null);
  const [submittingPo, setSubmittingPo] = useState(false);
  const [poTags, setPoTags] = useState([]);
  const [inputValue, setInputValue] = useState('');
  
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [selectedEmailProcess, setSelectedEmailProcess] = useState(null);

  const [filterOptions, setFilterOptions] = useState(EMPTY_OPTIONS);
  const debounceSearch  = useRef(null);
  const skipFirstEffect = useRef(true);

  const getFilterDisplayValue = useCallback((val) => {
    if (!val || val === 'All') return 'All';
    if (STATUS_META[val]) return STATUS_META[val].label;
    if (val === 'ON_APPROVAL') return 'On Approval';
    if (val === 'ON_DATE')     return 'On Date';
    return String(val);
  }, []);

  // ── Build query params ────────────────────────────────────────────────────
  const buildParams = useCallback((overrides = {}) => {
    const pg  = overrides.pg  !== undefined ? overrides.pg  : page;
    const ps  = overrides.ps  !== undefined ? overrides.ps  : pageSize;
    const tab = overrides.tab !== undefined ? overrides.tab : activeTab;
    const sq  = overrides.sq  !== undefined ? overrides.sq  : search;
    const po  = overrides.po  !== undefined ? overrides.po  : poSearch;
    const tag = overrides.tag !== undefined ? overrides.tag : tagSearch;
    const wf  = overrides.wf  !== undefined ? overrides.wf  : selectedWorkflow;
    const ini = overrides.ini !== undefined ? overrides.ini : selectedInitiator;
    const st  = overrides.st  !== undefined ? overrides.st  : selectedStatus;
    const pm  = overrides.pm  !== undefined ? overrides.pm  : selectedPaymentMode;
    const cf  = overrides.cf  !== undefined ? overrides.cf  : createdFrom;
    const ct  = overrides.ct  !== undefined ? overrides.ct  : createdTo;
    const pf  = overrides.pf  !== undefined ? overrides.pf  : paymentFrom;
    const pt  = overrides.pt  !== undefined ? overrides.pt  : paymentTo;

    const params = { page: pg + 1, limit: ps, pageSize: ps };

    if (sq)         params.search         = sq;
    if (po  !== 'All') params.poSearch    = po;
    if (tag !== 'All') params.tagSearch   = tag;
    if (wf  !== 'All') params.workflowName  = wf;
    if (ini !== 'All') params.initiatorName = ini;
    if (pm  !== 'All') params.paymentMode   = pm;
    if (cf)            params.createdDateFrom = cf;
    if (ct)            params.createdDateTo   = ct;
    if (pf)            params.paymentDateFrom = pf;
    if (pt)            params.paymentDateTo   = pt;

    if (isPrivileged) {
      if (tab === 0) params.ownOnly = true;
      if (tab === 2) params.status  = 'NOT_COMPLETED';
      if (tab === 3) params.status  = 'COMPLETED';
    } else {
      if (tab === 1) params.status = 'NOT_COMPLETED';
      if (tab === 2) params.status = 'COMPLETED';
    }

    const isAllTab = isPrivileged ? (tab === 0 || tab === 1) : tab === 0;
    if (isAllTab && st !== 'All') params.status = st;

    return params;
  }, [page, pageSize, activeTab, search, poSearch, tagSearch, selectedWorkflow,
      selectedInitiator, selectedStatus, selectedPaymentMode, createdFrom, createdTo,
      paymentFrom, paymentTo, isPrivileged]);

  // ── Core fetch ────────────────────────────────────────────────────────────
  const fetchPage = useCallback(async (paramOverrides = {}, isFirst = false) => {
    if (isFirst) setLoading(true);
    else         setFetching(true);

    try {
      const params = buildParams(paramOverrides);
      const res    = await GetCompletedProcessList(params);
      const data   = res?.data?.processes || res?.data?.data || [];
      const pag    = res?.data?.pagination || res?.data || {};

      setRows(data.map((item, i) => ({ id: item._id || item.processId || `r-${params.page}-${i}`, ...item })));
      setTotal(pag.total ?? data.length);

      if (res?.data?.filterOptions) {
        setFilterOptions(res.data.filterOptions);
      }

      if (isFirst || paramOverrides.isRefresh) {
        try {
          const summaryBase = [
            GetCompletedProcessList({ page: 1, limit: 1 }),
            GetCompletedProcessList({ page: 1, limit: 1, status: 'NOT_COMPLETED' }),
            GetCompletedProcessList({ page: 1, limit: 1, status: 'COMPLETED' }),
          ];

          const privilegedExtra = isPrivileged
            ? [
                GetCompletedProcessList({ page: 1, limit: 1, showAll: true }),
                GetCompletedProcessList({ page: 1, limit: 1, showAll: true, status: 'NOT_COMPLETED' }),
                GetCompletedProcessList({ page: 1, limit: 1, showAll: true, status: 'COMPLETED' }),
              ]
            : [];

          const results = await Promise.all([...summaryBase, ...privilegedExtra]);
          const getTot  = (r) => r?.data?.pagination?.total || r?.data?.total || 0;

          setOwnTotal(getTot(results[0]));
          setOwnInProg(getTot(results[1]));
          setOwnCompleted(getTot(results[2]));

          if (isPrivileged) {
            setAllTotal(getTot(results[3]));
            setAllInProg(getTot(results[4]));
            setAllCompleted(getTot(results[5]));
          }
        } catch { /* non-critical */ }
      }
    } catch (err) {
      console.error('InitiatedProcesses fetchPage error:', err);
      toast.error(err?.response?.data?.message || 'Failed to load processes');
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [buildParams, isPrivileged]);

  useEffect(() => { fetchPage({}, true); }, []); 

  useEffect(() => {
    if (skipFirstEffect.current) { skipFirstEffect.current = false; return; }
    fetchPage({ pg: page, ps: pageSize });
  }, [
    page, pageSize, search, poSearch, tagSearch,
    selectedWorkflow, selectedInitiator, selectedStatus,
    selectedPaymentMode, createdFrom, createdTo, paymentFrom, paymentTo, activeTab,
  ]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSearchChange = (v) => {
    setSearchInput(v);
    clearTimeout(debounceSearch.current);
    debounceSearch.current = setTimeout(() => { setSearch(v); setPage(0); }, 500);
  };
  const handleTabChange = (_, v) => { setActiveTab(v); setPage(0); setSelectedStatus('All'); };
  
  const resetFilters = () => {
    setSearchInput(''); setSearch('');
    setPoSearch('All'); setTagSearch('All');
    setSelectedWorkflow('All'); setSelectedInitiator('All');
    setSelectedStatus('All'); setSelectedPaymentMode('All');
    setCreatedFrom(''); setCreatedTo('');
    setPaymentFrom(''); setPaymentTo('');
    setPage(0);
  };

  const hasActiveFilters =
    search || poSearch !== 'All' || tagSearch !== 'All' ||
    selectedWorkflow !== 'All' || selectedInitiator !== 'All' ||
    selectedStatus !== 'All' || selectedPaymentMode !== 'All' ||
    createdFrom || createdTo || paymentFrom || paymentTo;

  const handleView = (id) => navigate(`/process/view/${id}`);

  // --- Attach PO Modal & Email Logic ---
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
    if (!/^\d{10}$/.test(trimmedInput)) {
      toast.warning("PO Number must be exactly 10 digits.");
      return;
    }
    if (poTags.includes(trimmedInput)) {
      toast.warning("This PO Number is already added.");
      return;
    }
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
    setPoTags(poTags.filter(tag => tag !== tagToRemove));
  };

  const handleAttachPo = async () => {
    let finalTags = [...poTags];
    const trimmedInput = inputValue.trim();
    if (trimmedInput) {
      if (!/^\d{10}$/.test(trimmedInput)) {
        toast.warning("The pending PO Number in the input field must be exactly 10 digits. Please add it or clear the input.");
        return;
      }
      if (!poTags.includes(trimmedInput)) {
        finalTags.push(trimmedInput);
      }
    }
    if (finalTags.length === 0) {
      toast.warning("Please add at least one 10-digit PO Number.");
      return;
    }
    
    setSubmittingPo(true);
    try {
      await AttachPoNumbers(selectedProcessId, finalTags);
      toast.success(`${finalTags.length} PO Number(s) attached successfully!`);
      setPoTags([]);
      setInputValue('');
      setPoModalOpen(false);
      await fetchPage({ pg: page, ps: pageSize }, false); // refresh grid silently
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to attach PO Numbers");
    } finally {
      setSubmittingPo(false);
    }
  };

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns = [
    {
      field: 'processName', headerName: 'Process', flex: 2, minWidth: 240, disableColumnMenu: true,
      renderCell: (params) => (
        <div className="flex flex-col justify-center h-full py-2 gap-0.5">
          <span onClick={() => handleView(params.row._id || params.row.processId)}
            className="text-blue-600 cursor-pointer hover:underline font-semibold text-sm truncate" title={params.value}>
            {params.value || '—'}
          </span>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <span className="text-xs text-gray-400">by {params.row.initiatorName || '—'}</span>
            {isPrivileged && !params.row.isOwnProcess && (
              <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 border border-purple-100 text-xs rounded font-medium">Others</span>
            )}
          </div>
          {params.row.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {params.row.tags.slice(0, 3).map((tag, i) => (
                <span key={i} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded border border-gray-200">{tag}</span>
              ))}
              {params.row.tags.length > 3 && <span className="text-xs text-gray-400">+{params.row.tags.length - 3}</span>}
            </div>
          )}
        </div>
      ),
    },
    {
      field: 'workflowName', headerName: 'Workflow', flex: 1, minWidth: 150, disableColumnMenu: true,
      renderCell: (params) => (
        <div className="flex flex-col justify-center h-full py-2">
          <span className="text-gray-700 text-sm font-medium">{params.value || '—'}</span>
          {params.row.currentStepName && <span className="text-xs text-gray-400 mt-0.5">↳ {params.row.currentStepName}</span>}
        </div>
      ),
    },
    {
      field: 'status', headerName: 'Status', width: 135, disableColumnMenu: true,
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
      field: 'poNumbers', headerName: 'PO Numbers', width: 150, disableColumnMenu: true,
      renderCell: (params) => {
        const pos = params.value || [];
        if (!Array.isArray(pos) || pos.length === 0) {
          return <span className="text-xs text-gray-400 flex items-center h-full py-2">—</span>;
        }
        const visiblePos = pos.slice(0, 1);
        const hiddenCount = pos.length - visiblePos.length;
        
        return (
          <div className="flex items-center gap-1.5 w-full h-full py-2">
            {visiblePos.map((po, idx) => (
              <div 
                key={idx} 
                className="flex items-center justify-center bg-indigo-50 text-indigo-700 border border-indigo-100 text-xs font-semibold px-2 py-1 rounded shadow-sm"
              >
                <span className="text-[10px] text-indigo-400 mr-0.5">#</span>{po}
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
      field: 'paymentMode', headerName: 'Payment', width: 145, disableColumnMenu: true,
      renderCell: (params) => (
        <div className="flex flex-col justify-center h-full py-2">
          {params.value ? (
            <>
              <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border w-fit"
                style={{
                  color: params.value === 'ON_APPROVAL' ? '#10b981' : '#3b82f6',
                  backgroundColor: params.value === 'ON_APPROVAL' ? '#f0fdf4' : '#eff6ff',
                  borderColor: params.value === 'ON_APPROVAL' ? '#6ee7b7' : '#93c5fd',
                }}>
                {params.value.replace(/_/g, ' ')}
              </span>
              {params.row.paymentDate && (
                <span className="text-xs text-gray-400 mt-0.5 flex items-center gap-0.5">
                  <IconCalendar size={10} />{moment(params.row.paymentDate).format('DD MMM YY')}
                </span>
              )}
              {params.row.paymentStatus && (
                <span className={`text-xs mt-0.5 font-medium ${params.row.paymentStatus === 'SENT' ? 'text-green-600' : 'text-amber-600'}`}>
                  {params.row.paymentStatus}
                </span>
              )}
            </>
          ) : <span className="text-xs text-gray-400">—</span>}
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
      field: 'actions', headerName: 'Actions', width: 140, sortable: false, disableColumnMenu: true,
      renderCell: (params) => (
        <div className="flex items-center gap-2 h-full py-1.5">
          <button onClick={() => handleView(params.row._id || params.row.processId)}
            className="p-1.5 bg-blue-600 hover:bg-blue-700 transition-all duration-150 rounded-md shadow-sm focus:outline-none" title="View Process">
            <IconEye size={16} color="white" />
          </button>

          {params.row.status === 'COMPLETED' && (
            <button
              className="p-1.5 bg-emerald-500 hover:bg-emerald-600 transition-all duration-150 rounded-md shadow-sm focus:outline-none"
              onClick={() => handleOpenPoModal(params.row._id || params.row.processId)}
              title="Add PO Numbers"
            >
              <IconPaperclip color="white" size={16} />
            </button>
          )}
          
          {params.row.status === 'COMPLETED' && (
            <button
              className="p-1.5 bg-indigo-500 hover:bg-indigo-600 transition-all duration-150 rounded-md shadow-sm focus:outline-none"
              onClick={() => handleOpenEmailModal(params.row)}
              title="Send Email"
            >
              <IconMail color="white" size={16} />
            </button>
          )}
        </div>
      ),
    },
  ];

  const tabDefs = isPrivileged
    ? [
        { label: `My Processes (${ownTotal})` },
        { label: `All Processes (${allTotal})`,     icon: <IconShieldCheck size={14} /> },
        { label: `All In Progress (${allInProg})`,  icon: <IconShieldCheck size={14} /> },
        { label: `All Completed (${allCompleted})`, icon: <IconShieldCheck size={14} /> },
      ]
    : [
        { label: `All (${ownTotal})` },
        { label: `In Progress (${ownInProg})` },
        { label: `Completed (${ownCompleted})` },
      ];

  const showStatusDropdown   = isPrivileged ? (activeTab === 0 || activeTab === 1) : activeTab === 0;
  const showInitiatorDropdown = isPrivileged && activeTab !== 0;

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
        {/* Summary & Actions */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          {isPrivileged ? (
            <>
              <div className="flex items-center gap-2.5 px-4 py-2.5 bg-purple-50 border border-purple-200 rounded-xl">
                <span className="text-2xl font-bold text-purple-700 leading-none">{ownTotal}</span>
                <span className="text-xs text-purple-500 leading-tight">My<br />Processes</span>
              </div>
              <div className="flex items-center gap-2.5 px-4 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm">
                <IconShieldCheck size={20} className="text-gray-400 flex-shrink-0" />
                <span className="text-2xl font-bold text-gray-800 leading-none">{allTotal}</span>
                <span className="text-xs text-gray-500 leading-tight">All<br />Processes</span>
              </div>
              <div className="flex items-center gap-2.5 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                <IconLoader2 size={20} className="text-blue-500 flex-shrink-0" />
                <span className="text-2xl font-bold text-blue-700 leading-none">{allInProg}</span>
                <span className="text-xs text-blue-500 leading-tight">In<br />Progress</span>
              </div>
              <div className="flex items-center gap-2.5 px-4 py-2.5 bg-green-50 border border-green-200 rounded-xl">
                <IconCircleCheck size={20} className="text-green-500 flex-shrink-0" />
                <span className="text-2xl font-bold text-green-700 leading-none">{allCompleted}</span>
                <span className="text-xs text-green-500 leading-tight">Com<br />pleted</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2.5 px-4 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm">
                <span className="text-2xl font-bold text-gray-800 leading-none">{ownTotal}</span>
                <span className="text-xs text-gray-500 leading-tight">Total<br />Processes</span>
              </div>
              <div className="flex items-center gap-2.5 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                <IconLoader2 size={20} className="text-blue-500 flex-shrink-0" />
                <span className="text-2xl font-bold text-blue-700 leading-none">{ownInProg}</span>
                <span className="text-xs text-blue-500 leading-tight">In<br />Progress</span>
              </div>
              <div className="flex items-center gap-2.5 px-4 py-2.5 bg-green-50 border border-green-200 rounded-xl">
                <IconCircleCheck size={20} className="text-green-500 flex-shrink-0" />
                <span className="text-2xl font-bold text-green-700 leading-none">{ownCompleted}</span>
                <span className="text-xs text-green-500 leading-tight">Com<br />pleted</span>
              </div>
            </>
          )}
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
            <button onClick={() => { setPage(0); fetchPage({ pg: 0, isRefresh: true }); }}
              disabled={fetching}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50">
              <IconRefresh size={14} className={fetching ? 'animate-spin' : ''} />
              Refresh Data
            </button>
          </div>
        </div>

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
          <Tabs value={activeTab} onChange={handleTabChange} textColor="primary" indicatorColor="primary"
            variant="scrollable" scrollButtons="auto"
            sx={{ '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, fontSize: '0.875rem' } }}>
            {tabDefs.map((t, i) => (
              <Tab key={i} label={<span className="flex items-center gap-1.5">{t.icon}{t.label}</span>} />
            ))}
          </Tabs>
        </Box>

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <FilterInput label="Search Process" icon={<IconSearch size={14} />}
                value={searchInput} onChange={handleSearchChange} placeholder="Search by process name..." />
            </div>
            <FilterAutocomplete label="Workflow" value={selectedWorkflow}
              onChange={(v) => { setSelectedWorkflow(v); setPage(0); }} options={filterOptions.workflows} />
            {showInitiatorDropdown && (
              <FilterAutocomplete label="Initiator" value={selectedInitiator}
                onChange={(v) => { setSelectedInitiator(v); setPage(0); }} options={filterOptions.initiators} />
            )}
            {showStatusDropdown && (
              <FilterAutocomplete label="Status" value={selectedStatus}
                onChange={(v) => { setSelectedStatus(v); setPage(0); }}
                options={['All', ...Object.keys(STATUS_META)]} getDisplayValue={getFilterDisplayValue} />
            )}
            <FilterAutocomplete label="Payment Mode" value={selectedPaymentMode}
              onChange={(v) => { setSelectedPaymentMode(v); setPage(0); }}
              options={PAYMENT_MODE_OPTIONS} getDisplayValue={getFilterDisplayValue} placeholder="Select mode..." />
            <FilterAutocomplete label="PO Number" value={poSearch}
              onChange={(v) => { setPoSearch(v); setPage(0); }}
              options={filterOptions.poNumbers} placeholder="Type or select PO..." />
            <FilterAutocomplete label="Process Tag" value={tagSearch}
              onChange={(v) => { setTagSearch(v); setPage(0); }}
              options={filterOptions.tags} placeholder="Type or select Tag..." />
            {[
              ['Created From', createdFrom, setCreatedFrom],
              ['Created To',   createdTo,   setCreatedTo],
              ['Payment Date From', paymentFrom, setPaymentFrom],
              ['Payment Date To',   paymentTo,   setPaymentTo],
            ].map(([lbl, val, setter]) => (
              <div key={lbl} className="flex flex-col gap-1 w-full">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{lbl}</label>
                <input type="date"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 bg-white text-gray-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all h-[36px]"
                  value={val} onChange={(e) => { setter(e.target.value); setPage(0); }} />
              </div>
            ))}
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
                    <IconPackage size={40} strokeWidth={1.5} className="text-gray-400" />
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

      {/* --- Attach PO Modal --- */}
      {poModalOpen && (
        <CustomModal 
          isOpen={poModalOpen} 
          onClose={() => setPoModalOpen(false)} 
          className="max-w-xl w-full rounded-2xl"
        >
          <div className="p-0 bg-white rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2.5 rounded-xl text-blue-600 shadow-sm">
                  <IconPaperclip size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800 leading-tight">Add PO Numbers</h2>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-0.5">
                    Process ID: <span className="text-slate-700">{selectedProcessId}</span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setPoModalOpen(false)}
                className="p-2 bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all shadow-sm"
              >
                <IconX size={20} stroke={2.5} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 flex justify-between">
                  <span>Enter PO Number</span>
                  <span className="text-[11px] font-semibold text-slate-400">Exact 10 digits required</span>
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
                    className="flex-1 bg-white border border-slate-300 outline-none text-sm text-slate-700 py-2.5 px-4 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
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
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Added POs ({poTags.length})
                  </h3>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl max-h-[180px] overflow-y-auto p-2 space-y-2">
                    {poTags.map(tag => (
                      <div 
                        key={tag} 
                        className="flex justify-between items-center bg-white border border-slate-200 py-2 px-3 rounded-lg shadow-sm animate-in fade-in zoom-in-95 duration-200"
                      >
                        <span className="text-sm font-bold text-slate-700">{tag}</span>
                        <button 
                          onClick={() => removeTag(tag)} 
                          className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-md transition-colors"
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
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <CustomButton 
                variant="secondary" 
                text="Cancel" 
                className="bg-white border-slate-300 text-slate-700 hover:bg-slate-100 px-6 py-2 shadow-sm"
                click={() => setPoModalOpen(false)} 
              />
              <CustomButton 
                variant="primary" 
                text={submittingPo ? "Saving..." : "Save PO Numbers"} 
                className="px-6 py-2 shadow-md"
                click={handleAttachPo} 
                disabled={submittingPo || (poTags.length === 0 && !/^\d{10}$/.test(inputValue.trim()))} 
              />
            </div>
          </div>
        </CustomModal>
      )}

      {/* --- View Multiple POs Dialog --- */}
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

      {/* --- Email Manager Modal --- */}
      {emailModalOpen && selectedEmailProcess && (
        <EmailManagerModal
          isOpen={emailModalOpen}
          onClose={() => setEmailModalOpen(false)}
          processId={selectedEmailProcess._id || selectedEmailProcess.processId}
          processName={selectedEmailProcess.processName}
        />
      )}
    </div>
  );
}