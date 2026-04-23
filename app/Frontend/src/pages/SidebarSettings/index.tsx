// pages/SidebarSettings/index.tsx
import React, { useState, useEffect } from 'react';
import { Switch, CircularProgress } from '@mui/material';
import { IconDeviceFloppy, IconAlertCircle, IconEye, IconEyeOff } from '@tabler/icons-react';
import { toast } from 'react-toastify';
import CustomCard from '../../CustomComponents/CustomCard';
import { GetSidebarConfig, SaveSidebarConfig } from '../../common/Apis';

// Must match the configKey values in the Sidebar component
const ALL_ITEMS: { key: string; label: string; alwaysVisible?: boolean; notForNormal?: boolean }[] = [
  { key: 'dashboard',        label: 'Dashboard',                    alwaysVisible: true  },
  { key: 'files',            label: 'File System'                                        },
  { key: 'search',           label: 'Deep Search'                                        },
  { key: 'workflows',        label: 'Workflows'                                          },
  { key: 'masterTags',       label: 'Master Tags'                                        },
  { key: 'processWork',      label: 'Processes → Pending Work'                           },
  { key: 'processInitiated', label: 'Processes → Initiated'                              },
  { key: 'processInitiate',  label: 'Processes → Initiate'                               },
  { key: 'recommendations',  label: 'Recommendations'                                    },
  { key: 'logs',             label: 'Logs'                                               },
  { key: 'departments',      label: 'Departments',  notForNormal: true                   },
  { key: 'roles',            label: 'Roles',         notForNormal: true                  },
  { key: 'users',            label: 'Users',         notForNormal: true                  },
  { key: 'reports',          label: 'Reports',       notForNormal: true                  },
];

export const DEFAULT_SIDEBAR_CONFIG = {
  normalUser:    ['dashboard','files','search','workflows','masterTags','processWork','processInitiated','processInitiate','recommendations'],
  adminUser:     ['dashboard','files','search','workflows','masterTags','processWork','processInitiated','processInitiate','recommendations','logs','departments','roles','users','reports'],
  rootLevelUser: ['dashboard','files','search','workflows','masterTags','processWork','processInitiated','processInitiate','recommendations','logs','departments','roles','users','reports'],
};

// Define the precise type based on the keys of DEFAULT_SIDEBAR_CONFIG
type RoleKey = keyof typeof DEFAULT_SIDEBAR_CONFIG;

const ROLE_TYPES: {
  key: RoleKey;
  label: string;
  description: string;
  accent: string;
  bg: string;
  border: string;
}[] = [
  {
    key: 'normalUser',
    label: 'Normal User',
    description: 'Non-admin, non-root users',
    accent: '#3b82f6',
    bg: '#eff6ff',
    border: '#93c5fd',
  },
  {
    key: 'adminUser',
    label: 'Admin User',
    description: 'Users with isAdmin = true',
    accent: '#8b5cf6',
    bg: '#f5f3ff',
    border: '#c4b5fd',
  },
  {
    key: 'rootLevelUser',
    label: 'Root Level User',
    description: 'Users with isRootLevel = true',
    accent: '#f59e0b',
    bg: '#fffbeb',
    border: '#fcd34d',
  },
];

export default function SidebarSettings() {
  const [config, setConfig]   = useState<typeof DEFAULT_SIDEBAR_CONFIG>(DEFAULT_SIDEBAR_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await GetSidebarConfig();
        if (res?.data?.config) setConfig(res.data.config);
      } catch { /* fall back to defaults */ }
      finally { setLoading(false); }
    })();
  }, []);

  const toggle = (roleKey: RoleKey, itemKey: string) => {
    setConfig(prev => {
      const current = prev[roleKey] || [];
      const updated = current.includes(itemKey)
        ? current.filter(k => k !== itemKey)
        : [...current, itemKey];
      return { ...prev, [roleKey]: updated };
    });
  };

  const toggleAll = (roleKey: RoleKey, enable: boolean) => {
    setConfig(prev => ({
      ...prev,
      [roleKey]: enable
        ? ALL_ITEMS.map(i => i.key)
        : ALL_ITEMS.filter(i => i.alwaysVisible).map(i => i.key),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await SaveSidebarConfig(config);
      toast.success('Sidebar configuration saved successfully');
    } catch {
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <CircularProgress size={32} />
    </div>
  );

  return (
    <CustomCard>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Sidebar Visibility</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Control which sidebar items are visible for each role type. Changes take effect on next page load.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 shadow-sm"
        >
          {saving ? <CircularProgress size={14} sx={{ color: 'white' }} /> : <IconDeviceFloppy size={16} />}
          Save Changes
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg mb-6">
        <IconAlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">
          <strong>Dashboard</strong> is always visible and cannot be hidden.
          Admin-only items (Departments, Roles, Users, Reports) are not applicable to Normal Users.
          Sidebar config is cached for 5 minutes per session.
        </p>
      </div>

      {/* Role columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {ROLE_TYPES.map(roleType => {
          const visible    = config[roleType.key] || [];
          const applicable = ALL_ITEMS.filter(i => !(i.notForNormal && roleType.key === 'normalUser'));
          const allOn      = applicable.every(i => visible.includes(i.key));

          return (
            <div key={roleType.key} className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              {/* Column header */}
              <div
                className="px-4 py-3 border-b"
                style={{ backgroundColor: roleType.bg, borderColor: roleType.border }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-800 text-sm">{roleType.label}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{roleType.description}</p>
                  </div>
                  <span
                    className="text-xs font-bold px-2 py-1 rounded-full"
                    style={{ color: roleType.accent, backgroundColor: 'white', border: `1px solid ${roleType.border}` }}
                  >
                    {visible.length}/{applicable.length}
                  </span>
                </div>
                {/* Toggle all */}
                <button
                  onClick={() => toggleAll(roleType.key, !allOn)}
                  className="mt-2 flex items-center gap-1.5 text-xs font-medium hover:underline"
                  style={{ color: roleType.accent }}
                >
                  {allOn ? <IconEyeOff size={12} /> : <IconEye size={12} />}
                  {allOn ? 'Hide all' : 'Show all'}
                </button>
              </div>

              {/* Item rows */}
              <div className="divide-y divide-gray-100">
                {ALL_ITEMS.map(item => {
                  const isEnabled   = visible.includes(item.key);
                  const isLocked    = !!item.alwaysVisible;
                  const isNa        = !!(item.notForNormal && roleType.key === 'normalUser');

                  return (
                    <div
                      key={item.key}
                      className={`flex items-center justify-between px-4 py-2.5 ${
                        isLocked || isNa ? 'opacity-40' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div>
                        <span className="text-sm text-gray-700">{item.label}</span>
                        {isLocked && <p className="text-xs text-gray-400">Always visible</p>}
                        {isNa     && <p className="text-xs text-gray-400">Admin feature only</p>}
                      </div>
                      <Switch
                        size="small"
                        checked={isLocked ? true : isNa ? false : isEnabled}
                        disabled={isLocked || isNa}
                        onChange={() => toggle(roleType.key, item.key)}
                        sx={{
                          '& .MuiSwitch-switchBase.Mui-checked': { color: roleType.accent },
                          '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: roleType.border },
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </CustomCard>
  );
}