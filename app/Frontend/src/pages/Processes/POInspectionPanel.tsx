import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DataGrid,
  GridColDef,
  GridRenderCellParams,
} from '@mui/x-data-grid';

import {
  Box,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Tooltip,
} from '@mui/material';

import axios from 'axios';

import {
  IconEye,
  IconRefresh,
  IconShieldCheck,
  IconX,
  IconBriefcase,
  IconCloudUpload,
  IconSettingsAutomation,
  IconCheck,
  IconAlertTriangle,
  IconFileAlert,
} from '@tabler/icons-react';

import CustomCard from '../../CustomComponents/CustomCard';

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || 'http://localhost:9000';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface InspectionRow {
  id: string;
  processName: string;
  poNumbers: string[];
  mongoFullySynced: boolean;
  ftpFullySynced: boolean;
  missingFtpDocs?: string[];
}

// ─────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────

const fetchInspectionData = async () => {
  return await axios.get(`${BACKEND_URL}/check-po-sync-status`, {
    headers: {
      Authorization: `Bearer ${sessionStorage.getItem('accessToken')}`,
    },
  });
};

const triggerMassSync = async (processIds: string[]) => {
  return await axios.post(
    `${BACKEND_URL}/po-inspection/sync/mass`,
    { processIds },
    {
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem('accessToken')}`,
      },
    }
  );
};

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const STATUS_META = {
  SYNCED: {
    label: 'Synced',
    color: '#10b981',
    bg: '#f0fdf4',
    border: '#6ee7b7',
  },

  MISSING: {
    label: 'Missing',
    color: '#ef4444',
    bg: '#fef2f2',
    border: '#fca5a5',
  },
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

    '&:hover': {
      backgroundColor: '#f8fafc',
    },
  },

  '& .MuiDataGrid-cell': {
    borderBottom: 'none',

    '&:focus': {
      outline: 'none',
    },

    '&:focus-within': {
      outline: 'none',
    },
  },

  '& .MuiDataGrid-columnSeparator': {
    display: 'none',
  },

  '& .MuiDataGrid-footerContainer': {
    borderTop: '1px solid #e5e7eb',
  },
};

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function POInspectionPanel() {
  const navigate = useNavigate();

  const [data, setData] = useState<InspectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(15);

  const [syncingIds, setSyncingIds] = useState<string[]>([]);
  const [isMassSyncing, setIsMassSyncing] = useState(false);

  const [viewPoModalOpen, setViewPoModalOpen] = useState(false);
  const [viewPoData, setViewPoData] = useState<string[]>([]);

  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    loadData(true);
  }, []);

  // ─────────────────────────────────────────────────────────

  const loadData = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await fetchInspectionData();

      if (res.data.success) {
        setData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load inspection data', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ─────────────────────────────────────────────────────────

  const handleSync = async (
    processIds: string[],
    isMass = false
  ) => {
    if (isMass) setIsMassSyncing(true);

    setSyncingIds((prev) => [...prev, ...processIds]);

    try {
      const res = await triggerMassSync(processIds);

      if (res.data.success) {
        setTimeout(() => loadData(false), 1500);
      }
    } catch (err) {
      console.error('Sync failed', err);
    } finally {
      setSyncingIds((prev) =>
        prev.filter((id) => !processIds.includes(id))
      );

      if (isMass) {
        setIsMassSyncing(false);
      }
    }
  };

  // ─────────────────────────────────────────────────────────

  const handleView = (id: string) => {
    navigate(`/process/view/${id}`);
  };

  // ─────────────────────────────────────────────────────────
  // METRICS
  // ─────────────────────────────────────────────────────────

  const totalProcesses = data.length;

  const fullySynced = data.filter(
    (d) => d.mongoFullySynced && d.ftpFullySynced
  ).length;

  const issuesFound = totalProcesses - fullySynced;

  const brokenProcessIds = data
    .filter((d) => !d.mongoFullySynced || !d.ftpFullySynced)
    .map((d) => d.id);

  // ─────────────────────────────────────────────────────────
  // COLUMNS
  // ─────────────────────────────────────────────────────────

  const columns: GridColDef[] = [
    {
      field: 'processName',
      headerName: 'Process',
      flex: 1.5,
      minWidth: 220,
      disableColumnMenu: true,

      renderCell: (params: GridRenderCellParams) => (
        <div className="flex flex-col justify-center h-full py-2 gap-0.5">
          <span
            onClick={() => handleView(params.row.id)}
            className="text-blue-600 cursor-pointer hover:underline font-semibold text-sm truncate"
            title={String(params.value)}
          >
            {String(params.value || '—')}
          </span>

          <div className="flex items-center gap-1.5 mt-0.5">
            <IconBriefcase
              size={11}
              className="text-gray-400 flex-shrink-0"
            />

            <span className="text-xs text-gray-500 truncate">
              ID: {params.row.id.substring(0, 8)}
            </span>
          </div>
        </div>
      ),
    },

    {
      field: 'poNumbers',
      headerName: 'PO Numbers',
      width: 160,
      disableColumnMenu: true,

      renderCell: (params: GridRenderCellParams) => {
        const pos = (params.value as string[]) || [];

        if (!Array.isArray(pos) || pos.length === 0) {
          return (
            <span className="text-xs font-medium text-gray-400 flex items-center h-full">
              —
            </span>
          );
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
                <span className="text-[10px] text-slate-400 mr-0.5">
                  #
                </span>

                {po}
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
      },
    },

    {
      field: 'mongoFullySynced',
      headerName: 'MongoDB Sync',
      width: 150,
      disableColumnMenu: true,

      renderCell: (params: GridRenderCellParams<boolean>) => {
        const meta = params.value
          ? STATUS_META.SYNCED
          : STATUS_META.MISSING;

        return (
          <div className="flex items-center h-full">
            <span
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] uppercase tracking-wider rounded-md font-bold border whitespace-nowrap"
              style={{
                color: meta.color,
                backgroundColor: meta.bg,
                borderColor: meta.border,
              }}
            >
              {params.value ? (
                <IconCheck size={14} />
              ) : (
                <IconAlertTriangle size={14} />
              )}

              {meta.label}
            </span>
          </div>
        );
      },
    },

    {
      field: 'ftpFullySynced',
      headerName: 'FTP Uploads',
      width: 180,
      disableColumnMenu: true,

      renderCell: (params: GridRenderCellParams<boolean>) => {
        const isSynced = params.value;

        const missingDocs =
          (params.row.missingFtpDocs as string[]) || [];

        const meta = isSynced
          ? STATUS_META.SYNCED
          : STATUS_META.MISSING;

        return (
          <div className="flex items-center h-full">
            {isSynced ? (
              <span
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] uppercase tracking-wider rounded-md font-bold border whitespace-nowrap"
                style={{
                  color: meta.color,
                  backgroundColor: meta.bg,
                  borderColor: meta.border,
                }}
              >
                <IconCheck size={14} />
                Uploaded
              </span>
            ) : (
              <Tooltip
                placement="top"
                arrow
                title={
                  <div className="p-1 max-h-40 overflow-y-auto">
                    <span className="font-bold text-xs border-b border-gray-400 pb-1 mb-1 block">
                      Missing Exact Files:
                    </span>

                    {missingDocs.map((doc, i) => (
                      <div
                        key={i}
                        className="text-[11px] py-0.5"
                      >
                        • {doc}
                      </div>
                    ))}
                  </div>
                }
              >
                <span
                  className="flex items-center cursor-help gap-1 px-2.5 py-1 text-[11px] uppercase tracking-wider rounded-md font-bold border whitespace-nowrap"
                  style={{
                    color: meta.color,
                    backgroundColor: meta.bg,
                    borderColor: meta.border,
                  }}
                >
                  <IconFileAlert size={14} />
                  {missingDocs.length} Missing
                </span>
              </Tooltip>
            )}
          </div>
        );
      },
    },

    {
      field: 'actions',
      headerName: '',
      width: 120,
      sortable: false,
      disableColumnMenu: true,

      renderCell: (params: GridRenderCellParams) => {
        const hasIssue =
          !params.row.mongoFullySynced ||
          !params.row.ftpFullySynced;

        const isSyncingThis = syncingIds.includes(params.row.id);

        return (
          <div className="flex items-center gap-2 h-full w-full">
            <button
              onClick={() => handleView(params.row.id)}
              className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white transition-all duration-150 rounded-md shadow-sm focus:outline-none"
              title="View Process"
            >
              <IconEye size={16} />
            </button>

            {hasIssue && (
              <button
                disabled={isSyncingThis || isMassSyncing}
                onClick={() =>
                  handleSync([params.row.id], false)
                }
                className="p-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white transition-all duration-150 rounded-md shadow-sm focus:outline-none"
                title="Force Resync"
              >
                {isSyncingThis ? (
                  <CircularProgress
                    size={16}
                    color="inherit"
                  />
                ) : (
                  <IconCloudUpload size={16} />
                )}
              </button>
            )}
          </div>
        );
      },
    },
  ];

  // ─────────────────────────────────────────────────────────
  // LOADING
  // ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <CustomCard>
        <div className="flex items-center justify-center h-[60vh] flex-col gap-4">
          <CircularProgress size={40} thickness={4} />

          <span className="text-sm font-medium text-gray-500 animate-pulse">
            Loading inspection data...
          </span>
        </div>
      </CustomCard>
    );
  }

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────

  return (
    <div className="animate-fade-in">
      <CustomCard>
        {/* Summary Row */}

        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm">
            <span className="text-2xl font-bold text-gray-800 leading-none">
              {totalProcesses}
            </span>

            <span className="text-xs text-gray-500 leading-tight">
              Total
              <br />
              Attached
            </span>
          </div>

          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
            <span className="text-2xl font-bold text-emerald-700 leading-none">
              {fullySynced}
            </span>

            <span className="text-xs text-emerald-600 leading-tight">
              Healthy
              <br />
              Syncs
            </span>
          </div>

          {issuesFound > 0 && (
            <div className="flex items-center gap-2.5 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl">
              <span className="text-2xl font-bold text-red-600 leading-none">
                {issuesFound}
              </span>

              <span className="text-xs text-red-500 leading-tight">
                Issues
                <br />
                Found
              </span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-3">
            {issuesFound > 0 && (
              <button
                onClick={() =>
                  handleSync(brokenProcessIds, true)
                }
                disabled={
                  isMassSyncing ||
                  refreshing ||
                  syncingIds.length > 0
                }
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-600 hover:text-white transition-colors shadow-sm disabled:opacity-50"
              >
                {isMassSyncing ? (
                  <CircularProgress
                    size={14}
                    color="inherit"
                  />
                ) : (
                  <IconSettingsAutomation size={16} />
                )}

                {isMassSyncing
                  ? 'Syncing...'
                  : `Fix All ${issuesFound} Issues`}
              </button>
            )}

            <button
              onClick={() => loadData(false)}
              disabled={refreshing || isMassSyncing}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
            >
              <IconRefresh
                size={14}
                className={
                  refreshing ? 'animate-spin' : ''
                }
              />

              Refresh Data
            </button>
          </div>
        </div>

        {/* GRID */}

        <Box
          sx={{
            height: '65vh',
            width: '100%',
            position: 'relative',
          }}
        >
          <DataGrid
            rows={data}
            columns={columns}
            paginationMode="client"
            paginationModel={{
              page,
              pageSize,
            }}
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
            getRowHeight={() => 'auto'}
            sx={gridStyles}
            slots={{
              noRowsOverlay: () => (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3 py-16">
                  <div className="p-4 bg-gray-50 rounded-full">
                    <IconShieldCheck
                      size={40}
                      strokeWidth={1.5}
                      className="text-gray-400"
                    />
                  </div>

                  <p className="text-sm font-medium text-gray-600">
                    No PO attached processes found
                  </p>
                </div>
              ),
            }}
          />
        </Box>
      </CustomCard>

      {/* MODAL */}

      <Dialog
        open={viewPoModalOpen}
        onClose={() => setViewPoModalOpen(false)}
        PaperProps={{
          sx: {
            borderRadius: '1rem',
            minWidth: '320px',
          },
        }}
      >
        <DialogTitle
          sx={{
            m: 0,
            p: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f8fafc',
            borderBottom: '1px solid #f1f5f9',
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-slate-800">
              Attached POs
            </span>

            <span className="text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full text-xs font-bold">
              {viewPoData.length}
            </span>
          </div>

          <IconButton
            onClick={() => setViewPoModalOpen(false)}
            size="small"
            sx={{ color: '#94a3b8' }}
          >
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
                  <span className="text-slate-400 font-medium mr-2 text-xs uppercase tracking-wider">
                    Entry #{idx + 1}
                  </span>

                  <span className="tracking-wide">
                    {po}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}