import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import SidebarLinkGroup from './SidebarLinkGroup';
import { Button, Stack, Tooltip } from '@mui/material';
import sessionData from '../../Store';
import {
  IconBrandSpeedtest,
  IconCaretDown,
  IconCornerDownRight,
  IconFolderOpen,
  IconBuildingEstate,
  IconUser,
  IconUserSquareRounded,
  IconChartDots3,
  IconSquareLetterX,
  IconDeviceIpadHorizontalQuestion,
  IconHistory,
  IconSearch,
  IconFile,
  IconTags,
  IconSettings,
  IconFileCheck
} from '@tabler/icons-react';
import { defaultPath } from '../../Slices/PathSlice';
import { useDispatch } from 'react-redux';
import { getRecommendations, GetSidebarConfig } from '../../common/Apis';
import { DEFAULT_SIDEBAR_CONFIG } from '../../pages/SidebarSettings';

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (arg: boolean) => void;
}

const CACHE_KEY = 'sidebarConfig_v1';
const CACHE_TTL = 5 * 60 * 1000;

function getRoleTypeKey(isAdmin: boolean, isRootUser: boolean): string {
  if (isRootUser) return 'rootLevelUser';
  if (isAdmin)    return 'adminUser';
  return 'normalUser';
}

const ProcessIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M3 7m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z" />
    <path d="M8 7v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2" />
    <path d="M12 12l0 .01" />
    <path d="M3 13a20 20 0 0 0 18 0" />
  </svg>
);

const Sidebar = ({ sidebarOpen, setSidebarOpen }: SidebarProps) => {
  const [open, setOpen]                             = useState<string>('');
  const [sidebarConfig, setSidebarConfig]           = useState<Record<string, string[]>>(DEFAULT_SIDEBAR_CONFIG);
  const { show, recommendationsLength, setRecommendationsLength } = sessionData();
  const location   = useLocation();
  const { pathname } = location;
  const username   = sessionStorage.getItem('username') || '';

  const isAdmin    = sessionStorage.getItem('isAdmin')    === 'true';
  const isRootUser = sessionStorage.getItem('specialUser') === 'true'
                  || sessionStorage.getItem('isRootUser')  === 'true';

  const roleTypeKey = getRoleTypeKey(isAdmin, isRootUser);

  const trigger = useRef<any>(null);
  const sidebar = useRef<any>(null);

  const storedSidebarExpanded = sessionStorage.getItem('sidebar-expanded');
  const [sidebarExpanded, setSidebarExpanded] = useState(storedSidebarExpanded === 'true');

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (raw) {
          const { data, ts } = JSON.parse(raw);
          if (Date.now() - ts < CACHE_TTL) {
            setSidebarConfig(data);
            return;
          }
        }
        const res = await GetSidebarConfig();
        if (res?.data?.config) {
          setSidebarConfig(res.data.config);
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: res.data.config, ts: Date.now() }));
        }
      } catch {
      }
    };
    loadConfig();
  }, []);

  const canSee = (key: string) => (sidebarConfig[roleTypeKey] || []).includes(key);

  useEffect(() => {
    const handler = ({ target }: MouseEvent) => {
      if (!sidebar.current || !trigger.current) return;
      if (!sidebarOpen || sidebar.current.contains(target) || trigger.current.contains(target)) return;
      setSidebarOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [sidebarOpen]);

  useEffect(() => {
    const handler = ({ keyCode }: KeyboardEvent) => {
      if (!sidebarOpen || keyCode !== 27) return;
      setSidebarOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [sidebarOpen]);

  useEffect(() => {
    sessionStorage.setItem('sidebar-expanded', sidebarExpanded.toString());
    document.querySelector('body')?.classList.toggle('sidebar-expanded', sidebarExpanded);
  }, [sidebarExpanded]);

  const dispatch = useDispatch();
  const navigate = useNavigate();

  function truncateUsername(u: string, maxLength = 12) {
    if (!u) return '';
    return u.length <= maxLength ? u : `${u.substring(0, maxLength)}...`;
  }

  useEffect(() => {
    (async () => {
      try {
        const response = await getRecommendations();
        setRecommendationsLength(response?.data?.recommendations?.length);
      } catch {}
    })();
  }, []);

  const processSubItems = [
    canSee('processWork')      && { path: '/processes/work',      label: 'Pending Work'       },
    canSee('processInitiated') && { path: '/processes/initiated', label: 'Initiated Processes' },
    canSee('processInitiate')  && { path: '/processes/initiate',  label: 'Initiate Process'   },
  ].filter(Boolean) as { path: string; label: string }[];

  const showProcessGroup = processSubItems.length > 0;

  const routes = [
    canSee('dashboard') && {
      path: '/',
      label: 'Dashboard',
      icon: <IconBrandSpeedtest size={26} />,
      active: pathname === '/',
    },
    canSee('files') && {
      path: '/files',
      label: 'File System',
      icon: <IconFolderOpen size={26} />,
      active: pathname === '/files',
    },
    canSee('search') && {
      path: '/search',
      label: 'Deep Search',
      icon: <IconSearch size={26} />,
      active: pathname === '/search',
    },
    canSee('workflows') && {
      path: '/workflows',
      label: 'Workflows',
      icon: <IconChartDots3 size={26} />,
      active: pathname === '/workflows',
    },
    canSee('masterTags') && {
      path: '/master/tags',
      label: 'Master Tags',
      icon: <IconTags size={26} />,
      active: pathname === '/master/tags',
    },
    canSee('departments') && {
      path: '/department',
      label: 'Departments',
      icon: <IconBuildingEstate size={26} />,
      dropdown: [
        { path: '/departments/list',      label: 'List Departments' },
        { path: '/departments/createNew', label: 'Create Department' },
      ],
      active: pathname.includes('departments'),
    },
    canSee('roles') && {
      path: '/roles',
      label: 'Roles',
      icon: <IconUserSquareRounded size={26} />,
      dropdown: [
        { path: '/roles/list',      label: 'List Roles'  },
        { path: '/roles/createNew', label: 'Create Role' },
      ],
      active: pathname.includes('roles'),
    },
    canSee('users') && {
      path: '/users',
      label: 'Users',
      icon: <IconUser size={26} />,
      dropdown: [
        { path: '/users/list',      label: 'List Users'  },
        { path: '/users/createNew', label: 'Create User' },
      ],
      active: pathname.includes('users'),
    },
    canSee('reports') && {
      path: '/reports',
      label: 'Reports',
      icon: <IconFile size={26} />,
      active: pathname.includes('reports'),
    },
    showProcessGroup && {
      path: '/processes',
      label: 'Processes',
      icon: <ProcessIcon />,
      dropdown: processSubItems,
      active: processSubItems.some(sub => pathname.startsWith(sub.path)), 
    },
    (isAdmin || isRootUser) && {
      path: '/admin/processes/list',
      label: 'All Processes (Admin)',
      icon: <IconFile size={26} />,
      active: pathname.startsWith('/admin/processes'),
    },
    (isAdmin || isRootUser) && {
      path: '/admin/po-inspection',
      label: 'PO Sync Inspection',
      icon: <IconFileCheck size={26} />,
      active: pathname === '/admin/po-inspection',
    },
    canSee('logs') && {
      path: '/logs',
      label: 'Logs',
      icon: <IconHistory size={26} />,
      active: pathname.includes('logs'),
    },
    canSee('recommendations') && {
      path: '/recommendations',
      label: 'Recommendations',
      icon: <IconDeviceIpadHorizontalQuestion size={26} />,
      active: pathname.includes('recommendation'),
      badge: recommendationsLength,
    },
    (isAdmin || isRootUser) && {
      path: '/settings/sidebar',
      label: 'Sidebar Settings',
      icon: <IconSettings size={26} />,
      active: pathname === '/settings/sidebar',
    },
  ].filter(Boolean) as any[];

  return (
    <aside
      ref={sidebar}
      style={{ width: '280px' }}
      className={`absolute bg-sidebar-gradient-9 left-0 top-0 z-99 flex h-screen w-72.5 flex-col overflow-y-hidden bg-black duration-300 ease-linear dark:bg-boxdark lg:static lg:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <button
        ref={trigger}
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-controls="sidebar"
        aria-expanded={sidebarOpen}
        className="flex lg:hidden justify-end p-1"
      >
        <IconSquareLetterX color="white" />
      </button>

      <Tooltip title={username}>
        <Button
          onClick={() => navigate('/profile')}
          sx={{
            border: 'none',
            margin: '12px',
            borderRadius: '8px',
            backgroundColor: '#FFFFFF44',
            color: 'white',
            fontSize: '20px',
            '&:hover': { backgroundColor: '#FFFFFF66' },
            fontWeight: 600,
          }}
        >
          {truncateUsername(username)}
        </Button>
      </Tooltip>

      <div className="no-scrollbar flex flex-col overflow-y-auto duration-300 ease-linear">
        <nav className="py-1 px-1">
          <ul className="mb-6 flex flex-col gap-0.5 p-1">
            {routes.map((route, index) => {
              if (route.dropdown && route.dropdown.length > 0) {
                return (
                  <SidebarLinkGroup key={index} activeCondition={route.active}>
                    {() => (
                      <React.Fragment>
                        <NavLink
                          to="#"
                          className={`group relative flex items-center gap-3 rounded-sm px-4 py-3 font-medium text-bodydark1 duration-300 ease-in-out hover:bg-gray-700 dark:hover:bg-meta-4 ${
                            route.active ? 'bg-sidebar-active text-white' : ''
                          }`}
                          onClick={(e) => {
                            e.preventDefault();
                            sidebarExpanded
                              ? setOpen(prev => prev === route.path ? '' : route.path)
                              : setSidebarExpanded(true);
                          }}
                        >
                          {route.icon}
                          {route.label}
                          <IconCaretDown
                            size={18}
                            className={`absolute right-4 top-1/2 -translate-y-1/2 transform fill-current duration-300 ease-in-out ${
                              open === route.path ? 'rotate-180' : 'rotate-0'
                            }`}
                          />
                        </NavLink>
                        {open === route.path && (
                          <Stack gap={1} sx={{ ml: 4.2, mt: 1, mb: 1 }}>
                            {route.dropdown.map((subRoute: any, subIndex: number) => (
                              <NavLink
                                key={subIndex}
                                to={subRoute.path}
                                className={({ isActive }) =>
                                  `group relative flex items-center gap-2.5 rounded-md pl-2 font-medium text-bodydark2 duration-300 ease-in-out hover:text-white ${
                                    isActive && '!text-white'
                                  }`
                                }
                              >
                                <IconCornerDownRight />
                                {subRoute.label}
                              </NavLink>
                            ))}
                          </Stack>
                        )}
                      </React.Fragment>
                    )}
                  </SidebarLinkGroup>
                );
              }

              return (
                <NavLink
                  key={index}
                  to={route.path}
                  onClick={() => {
                    if (route.path === '/physicalDocuments') {
                      sessionStorage.setItem('path', '..');
                      dispatch(defaultPath());
                    }
                  }}
                  className={`group relative flex items-center gap-3 rounded-sm py-3 px-4 font-medium text-bodydark1 duration-300 ease-in-out hover:bg-gray-700 dark:hover:bg-meta-4 hover:text-white ${
                    route.active ? 'bg-sidebar-active text-white' : ''
                  }`}
                >
                  {route.icon}
                  <span className="duration-300 ease-in-out transform group-hover:scale-105">
                    {route.label}
                  </span>
                  {route.badge > 0 && (
                    <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
                      {route.badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </ul>
        </nav>
      </div>
    </aside>
  );
};

export default Sidebar;