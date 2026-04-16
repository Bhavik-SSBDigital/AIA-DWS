import React, { useEffect, useState } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { useNavigate } from 'react-router-dom';
import EmailManagerModal from './EmailManagerModal';
import moment from 'moment';
import ComponentLoader from '../../common/Loader/ComponentLoader';
import { IconEye, IconPaperclip, IconX, IconMail, IconPlus, IconTrash } from '@tabler/icons-react';
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
  
  // Attach PO Modal State
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [selectedProcessId, setSelectedProcessId] = useState(null);
  const [submittingPo, setSubmittingPo] = useState(false);
  const [poTags, setPoTags] = useState([]);
  const [inputValue, setInputValue] = useState('');

  // View Multiple POs Modal State
  const [viewPoModalOpen, setViewPoModalOpen] = useState(false);
  const [viewPoData, setViewPoData] = useState([]);

  // Email Modal State
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

  // --- Attach PO Logic ---
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
      
      // AWAIT the fetch to guarantee the grid re-renders with the fresh PO data instantly
      await fetchProcesses(); 
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to attach PO Numbers");
    } finally {
      setSubmittingPo(false);
    }
  };

  // --- Columns Configuration ---
  const columns = [
    { field: 'processName', headerName: 'Process Name', width: 200 },
    { field: 'initiatorUsername', headerName: 'Initiator', width: 160 },
    {
      field: 'createdAt',
      headerName: 'Created At',
      width: 180,
      valueGetter: (value) => value ? moment(value).format('DD-MMM-YYYY hh:mm A') : '--',
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 160,
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
      field: 'poNumbers',
      headerName: 'Attached POs',
      width: 180, // Drastically reduced width
      renderCell: (params) => {
        const pos = params.value || [];
        
        // Minimalistic UI for Pending / No POs
        if (!Array.isArray(pos) || pos.length === 0) {
          return <span className="text-[13px] font-bold text-slate-300 ml-2">--</span>;
        }

        // Show ONLY the first PO to save space, hide the rest behind the button
        const visiblePos = pos.slice(0, 1);
        const hiddenCount = pos.length - visiblePos.length;

        return (
          <div className="flex items-center gap-1.5 w-full h-full py-1">
            {visiblePos.map((po, idx) => (
              <div 
                key={idx} 
                className="flex items-center justify-center bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold px-2 py-1 rounded shadow-sm cursor-default"
              >
                <span className="text-[9px] text-slate-400 mr-0.5">#</span>{po}
              </div>
            ))}
            
            {/* Clickable +X More Button */}
            {hiddenCount > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation(); // Prevents row click
                  setViewPoData(pos);
                  setViewPoModalOpen(true);
                }}
                className="flex items-center justify-center bg-blue-50 text-blue-600 border border-blue-200 text-[11px] font-bold px-2 py-1 rounded shadow-sm hover:bg-blue-600 hover:text-white transition-colors cursor-pointer"
              >
                +{hiddenCount} More
              </button>
            )}
          </div>
        );
      }
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 160,
      renderCell: (params) => (
        <div className="flex space-x-2 m-1 items-center">
          <button
            className="p-2 bg-button-primary-default hover:bg-button-primary-hover rounded-lg transition-colors"
            onClick={() => handleView(params.row.processId)}
            title="View Process"
          >
            <IconEye color="white" size={18} />
          </button>
          
          {(params.row.status === 'COMPLETED' || params.row.status === 'PO_NO_ATTACHED') && (
            <button
              className="p-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg shadow-sm transition-colors"
              onClick={() => handleOpenPoModal(params.row.processId)}
              title="Attach PO Numbers"
            >
              <IconPaperclip color="white" size={18} />
            </button>
          )}
          
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
    poNumbers: item.poNumbers || [], 
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

      {/* --- Attach New PO Numbers Modal --- */}
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
                  <h2 className="text-xl font-bold text-slate-800 leading-tight">Attach PO Numbers</h2>
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

      {/* --- View All PO Numbers Modal --- */}
      {viewPoModalOpen && (
        <CustomModal
          isOpen={viewPoModalOpen}
          onClose={() => setViewPoModalOpen(false)}
          className="max-w-sm w-full rounded-2xl"
        >
          <div className="p-0 bg-white rounded-2xl overflow-hidden shadow-xl border border-slate-100">
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-base font-bold text-slate-800">
                Attached PO Numbers <span className="text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full text-xs ml-1">{viewPoData.length}</span>
              </h2>
              <button
                onClick={() => setViewPoModalOpen(false)}
                className="p-1.5 bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all shadow-sm"
              >
                <IconX size={18} stroke={2.5} />
              </button>
            </div>
            
            <div className="p-5 max-h-[300px] overflow-y-auto">
              <div className="flex flex-col gap-2">
                {viewPoData.map((po, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between items-center bg-slate-50 text-slate-700 border border-slate-200 text-sm font-bold px-4 py-2.5 rounded-xl"
                  >
                    <span className="text-slate-400 font-medium mr-2">#{idx + 1}</span>
                    <span className="tracking-wide">{po}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CustomModal>
      )}

      {/* --- Email Manager Modal --- */}
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