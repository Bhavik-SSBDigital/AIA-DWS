import React, { useEffect, useState } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { useNavigate } from 'react-router-dom';
import EmailManagerModal from './EmailManagerModal';
import moment from 'moment';
import ComponentLoader from '../../common/Loader/ComponentLoader';
import { IconEye, IconPaperclip, IconX, IconCheck, IconMail } from '@tabler/icons-react';
import { GetCompletedProcessList, AttachPoNumbers } from '../../common/Apis';
import CustomCard from '../../CustomComponents/CustomCard';
import CustomModal from '../../CustomComponents/CustomModal';
import CustomButton from '../../CustomComponents/CustomButton';
import { toast } from 'react-toastify';

export default function CompletedProcesses() {
  const [data, setData] = useState([]);
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Modal State for PO Attachment
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [selectedProcessId, setSelectedProcessId] = useState(null);
  const [submittingPo, setSubmittingPo] = useState(false);
  
  // New Tag Input States
  const [poTags, setPoTags] = useState([]);
  const [inputValue, setInputValue] = useState('');

  const [emailModalOpen, setEmailModalOpen] = useState(false);
const [selectedEmailProcess, setSelectedEmailProcess] = useState(null);

  const handleOpenEmailModal = (process) => {
  setSelectedEmailProcess(process);
  setEmailModalOpen(true);
};


  const fetchProcesses = async () => {
    try {
      const res = await GetCompletedProcessList();
      setData(res?.data?.data || []);
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
    navigate(`/process/view/${id}?completed=true`);
  };

  const handleOpenPoModal = (processId) => {
    setSelectedProcessId(processId);
    setPoTags([]);
    setInputValue('');
    setPoModalOpen(true);
  };

  // --- TAG INPUT LOGIC ---
  const addTags = (text) => {
    if (!text.trim()) return;
    // Split by comma, space, or newline, remove empty strings
    const newTags = text.split(/[\s,]+/).map(t => t.trim()).filter(Boolean);
    // Add to existing tags, ensuring no duplicates
    setPoTags(prev => [...new Set([...prev, ...newTags])]);
    setInputValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTags(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && poTags.length > 0) {
      // Remove last tag if backspace is pressed on empty input
      setPoTags(prev => prev.slice(0, -1));
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text');
    addTags(paste);
  };

  const removeTag = (tagToRemove) => {
    setPoTags(poTags.filter(tag => tag !== tagToRemove));
  };
  // -----------------------

  const handleAttachPo = async () => {
    // If they typed something but forgot to hit enter, grab it too
    const finalTags = inputValue.trim() 
      ? [...new Set([...poTags, ...inputValue.split(/[\s,]+/).map(t => t.trim()).filter(Boolean)])] 
      : poTags;

    if (finalTags.length === 0) return;
    
    setSubmittingPo(true);
    try {
      await AttachPoNumbers(selectedProcessId, finalTags);
      
      toast.success(`${finalTags.length} PO Number(s) attached successfully!`);
      
      // Clear the inputs, leave modal open as requested
      setPoTags([]);
      setInputValue('');
      fetchProcesses(); // Refresh data in the background
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to attach PO Numbers");
    } finally {
      setSubmittingPo(false);
    }
  };

  const columns = [
    { field: 'processName', headerName: 'Process Name', width: 200 },
    { field: 'initiatorUsername', headerName: 'Initiator', width: 200 },
    {
      field: 'createdAt',
      headerName: 'Created At',
      width: 200,
      valueGetter: (value) => value ? moment(value).format('DD-MMM-YYYY hh:mm A') : '--',
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 180,
      renderCell: (params) => {
        let bgColor = "bg-slate-500";
        if (params.value === 'COMPLETED') bgColor = "bg-emerald-500";
        if (params.value === 'PO_NO_ATTACHED') bgColor = "bg-blue-500";
        
        return (
          <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white rounded-full ${bgColor}`}>
            {params.value.replace(/_/g, ' ')}
          </span>
        );
      }
    },
{
  field: 'actions',
  headerName: 'Actions',
  width: 200,
  renderCell: (params) => (
    <div className="flex space-x-2 m-1 items-center">
      <button
        className="p-2 bg-button-primary-default hover:bg-button-primary-hover rounded-lg transition-colors"
        onClick={() => handleView(params.row.processId)}
        title="View Process"
      >
        <IconEye color="white" size={18} />
      </button>
      
      {/* Show PO attachment button only for COMPLETED (not PO_NO_ATTACHED) */}
      {params.row.status === 'COMPLETED' && (
        <button
          className="p-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg shadow-sm transition-colors"
          onClick={() => handleOpenPoModal(params.row.processId)}
          title="Attach PO Numbers"
        >
          <IconPaperclip color="white" size={18} />
        </button>
      )}
      
      {/* Show email button for both COMPLETED and PO_NO_ATTACHED */}
      {(params.row.status === 'COMPLETED' || params.row.status === 'PO_NO_ATTACHED') && (
        <button
          className="p-2 bg-indigo-500 hover:bg-indigo-600 rounded-lg shadow-sm transition-colors"
          onClick={() => handleOpenEmailModal(params.row)}
          title="Send Email"
        >
          <IconMail color="white" size={18} />
        </button>
      )}
    </div>
  ),
},
  ];

  const rows = filteredData.map((item, index) => ({
    id: index + 1,
    processId: item.processId,
    processName: item.processName,
    initiatorUsername: item.initiatorName,
    createdAt: item.createdAt,
    status: item.status, 
  }));

  useEffect(() => {
    fetchProcesses();
  }, []);

  return (
    <div>
      {loading ? (
        <ComponentLoader />
      ) : (
        <CustomCard>
          <label className="block text-sm font-medium text-slate-700 mb-1">Search Processes</label>
          <input
            onChange={(e) => setSearchTerm(e.target.value)}
            required
            placeholder="Search by name..."
            className="w-full p-2.5 border border-slate-300 rounded-lg mb-4 max-w-[250px] outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
          />
          <DataGrid
            rows={rows}
            columns={columns}
            pageSize={10}
            rowsPerPageOptions={[10]}
            disableSelectionOnClick
            className="bg-white"
          />
        </CustomCard>
      )}

      {/* Upgraded Modal for PO Attachment */}
      {poModalOpen && (
        <CustomModal 
          isOpen={poModalOpen} 
          onClose={() => setPoModalOpen(false)} 
          className="max-w-xl w-full rounded-2xl"
        >
          <div className="p-0 bg-white rounded-2xl overflow-hidden shadow-2xl">
            
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2.5 rounded-xl text-blue-600 shadow-sm">
                  <IconPaperclip size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800 leading-tight">Attach PO Numbers</h2>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-0.5">
                    Process ID: <span className="text-slate-700">{selectedProcessId}</span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setPoModalOpen(false)}
                className="p-2 bg-white border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-full transition-all shadow-sm"
              >
                <IconX size={20} stroke={2.5} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              
              <label className="flex justify-between items-end">
                <span className="text-sm font-bold text-slate-700">Enter PO Numbers</span>
                {poTags.length > 0 && (
                  <span className="text-xs font-bold text-blue-600">
                    {poTags.length} Added
                  </span>
                )}
              </label>

              {/* Tag Input Container */}
              <div className="w-full border border-slate-300 rounded-xl p-3 bg-slate-50 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all shadow-inner min-h-[120px] flex flex-col justify-start cursor-text" onClick={() => document.getElementById('po-input-field').focus()}>
                
                <div className="flex flex-wrap gap-2 mb-2">
                  {poTags.map(tag => (
                    <span 
                      key={tag} 
                      className="bg-white border border-blue-200 text-blue-700 text-xs font-bold pl-3 pr-1 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-200"
                    >
                      {tag}
                      <button 
                        onClick={() => removeTag(tag)} 
                        className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-0.5 rounded transition-colors"
                      >
                        <IconX size={14} stroke={3} />
                      </button>
                    </span>
                  ))}
                </div>
                
                <input
                  id="po-input-field"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  placeholder={poTags.length === 0 ? "Type PO and hit Enter, or paste a bulk list..." : "Type another..."}
                  className="w-full bg-transparent outline-none text-sm text-slate-700 flex-1 min-w-[200px] py-1"
                />
              </div>
              <p className="text-[11px] font-semibold text-slate-400">Press <kbd className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">Enter</kbd> or <kbd className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">,</kbd> to add. Paste from Excel to add multiple instantly.</p>
            </div>

            {/* Footer Actions */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <CustomButton 
                variant="secondary" 
                text="Close Modal" 
                className="bg-white border-slate-300 text-slate-700 hover:bg-slate-100 px-6 py-2 shadow-sm"
                click={() => setPoModalOpen(false)} 
              />
              <CustomButton 
                variant="primary" 
                text={submittingPo ? "Attaching..." : "Attach to Process"} 
                className="px-6 py-2 shadow-md"
                click={handleAttachPo} 
                disabled={submittingPo || (poTags.length === 0 && !inputValue.trim())} 
              />
            </div>

          </div>
        </CustomModal>
      )}

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