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
  IconDatabaseCog,
  IconChartDots3,
  IconSquareLetterX,
  IconRecycle,
  IconDeviceIpadHorizontalQuestion,
  IconHistory,
  IconArchive,
  IconSearch,
  IconScript,
  IconBookmark,
  IconFile,
  IconTags,
} from '@tabler/icons-react';
import { defaultPath } from '../../Slices/PathSlice';
import { useDispatch } from 'react-redux';
import { getRecommendations } from '../../common/Apis';

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (arg: boolean) => void;
}

const Sidebar = ({ sidebarOpen, setSidebarOpen }: SidebarProps) => {
  const [open, setOpen] = useState<string>('');
  const { show, recommendationsLength, setRecommendationsLength } =
    sessionData();
  const location = useLocation();
  const { pathname } = location;
  const username = sessionStorage.getItem('username');
  const isPhysicalDocumentKeeper =
    sessionStorage.getItem('isKeeperOfPhysicalDocs') === 'true';

  const trigger = useRef<any>(null);
  const sidebar = useRef<any>(null);

  const storedSidebarExpanded = sessionStorage.getItem('sidebar-expanded');
  const [sidebarExpanded, setSidebarExpanded] = useState(
    storedSidebarExpanded === 'true',
  );

  // Close on click outside
  useEffect(() => {
    const clickHandler = ({ target }: MouseEvent) => {
      if (!sidebar.current || !trigger.current) return;
      if (
        !sidebarOpen ||
        sidebar.current.contains(target) ||
        trigger.current.contains(target)
      )
        return;
      setSidebarOpen(false);
    };
    document.addEventListener('click', clickHandler);
    return () => document.removeEventListener('click', clickHandler);
  }, [sidebarOpen]);

  // Close if the esc key is pressed
  useEffect(() => {
    const keyHandler = ({ keyCode }: KeyboardEvent) => {
      if (!sidebarOpen || keyCode !== 27) return;
      setSidebarOpen(false);
    };
    document.addEventListener('keydown', keyHandler);
    return () => document.removeEventListener('keydown', keyHandler);
  }, [sidebarOpen]);

  useEffect(() => {
    sessionStorage.setItem('sidebar-expanded', sidebarExpanded.toString());
    document
      .querySelector('body')
      ?.classList.toggle('sidebar-expanded', sidebarExpanded);
  }, [sidebarExpanded]);

  const dispatch = useDispatch();
  const navigate = useNavigate();

  function truncateUsername(username: string, maxLength = 12) {
    if (!username || typeof username !== 'string') return '';
    return username.length <= maxLength
      ? username
      : `${username.substring(0, maxLength)}...`;
  }

  // Define the routes
  const routes = [
    {
      path: '/',
      label: 'Dashboard',
      icon: <IconBrandSpeedtest size={26} />,
      active: pathname == '/',
    },
    {
      path: '/files',
      label: 'File System',
      icon: <IconFolderOpen size={26} />,
      active: pathname == '/files',
    },
    {
      path: '/search',
      label: 'Deep Search',
      icon: <IconSearch size={26} />,
      active: pathname == '/search',
    },
    // {
    //   path: '/bin',
    //   label: 'Recycle Bin',
    //   icon: <IconRecycle size={26} />,
    //   active: pathname == '/bin',
    // },
    // {
    //   path: '/archive',
    //   label: 'Archive Files',
    //   icon: <IconArchive size={26} />,
    //   active: pathname == '/archive',
    // },
    // {
    //   path: '/bookmark',
    //   label: 'Bookmarked Files',
    //   icon: <IconBookmark size={26} />,
    //   active: pathname == '/bookmark',
    // },
    // {
    //   path: '/Search',
    //   label: 'Search Document',
    //   icon: <IconFolderSearch size={26} />,
    //   active: pathname == '/Search',
    // },
    // {
    //   path: '/meeting-manager',
    //   label: 'Meeting Manager',
    //   icon: <IconCalendarStats />,
    //   active: pathname == '/meeting-manager',
    // },
    // {
    //   path: '/monitor',
    //   label: 'Monitor Processes',
    //   icon: <IconChartHistogram size={26} />,
    //   active: pathname == '/monitor',
    // },
    {
      path: '/workflows',
      label: 'Workflows',
      icon: <IconChartDots3 size={26} />,
      active: pathname == '/workflows',
    },
    // {
    //   path: '/physical-document',
    //   label: 'Physical Document',
    //   icon: <IconScript size={26} />,
    //   active: pathname == '/physical-document',
    // },
    // isPhysicalDocumentKeeper && {
    //   path: '/meta-data',
    //   label: 'Meta Data Form',
    //   icon: <IconDatabaseCog size={26} />,
    //   active: pathname == '/meta-data',
    // },
    ...(show
      ? [
          {
            path: '/department',
            label: 'Departments',
            icon: <IconBuildingEstate size={26} />,
            dropdown: [
              { path: '/departments/list', label: 'List Departments' },
              { path: '/departments/createNew', label: 'Create Department' },
            ],
            active: pathname.includes('departments'),
          },
          {
            path: '/roles',
            label: 'Roles',
            icon: <IconUserSquareRounded size={26} />,
            dropdown: [
              { path: '/roles/list', label: 'List Roles' },
              { path: '/roles/createNew', label: 'Create Role' },
            ],
            active: pathname.includes('roles'),
          },
          {
            path: '/users',
            label: 'Users',
            icon: <IconUser size={26} />,
            dropdown: [
              { path: '/users/list', label: 'List Users' },
              { path: '/users/createNew', label: 'Create User' },
            ],
            active: pathname.includes('users'),
          },
          {
            path: '/reports',
            label: 'Reports',
            icon: <IconFile size={26} />,
            active: pathname.includes('reports'),
          },
        ]
      : []),
    {
      path: '/processes',
      label: 'Processes',
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M3 7m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z" />
          <path d="M8 7v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2" />
          <path d="M12 12l0 .01" />
          <path d="M3 13a20 20 0 0 0 18 0" />
        </svg>
      ),
      dropdown: [
        { path: '/processes/work', label: 'Pending Work' },
        { path: '/processes/completed', label: 'Initiated Processes' },

        { path: '/processes/initiate', label: 'Initiate Process' },
      ],
      active: pathname.includes('process'),
    },
    {
      path: '/master/tags',
      label: 'Master Tags',
      icon: <IconTags size={26} />,
      active: pathname == '/master/tags',
    },
    {
      path: '/logs',
      label: 'Logs',
      icon: <IconHistory size={26} />,
      active: pathname.includes('logs'),
    },
    {
      path: '/recommendations',
      label: 'Recommendations',
      icon: <IconDeviceIpadHorizontalQuestion size={26} />,
      active: pathname.includes('recommendation'),
    },

    //   isPhysicalDocumentKeeper && {
    //     path: '/physicalDocuments',
    //     label: 'Documents Tracking',
    //     icon: (
    //       <svg
    //         xmlns="http://www.w3.org/2000/svg"
    //         width="28"
    //         height="28"
    //         viewBox="0 0 24 24"
    //         fill="none"
    //         stroke="currentColor"
    //         strokeWidth="2"
    //         strokeLinecap="round"
    //         strokeLinejoin="round"
    //       >
    //         <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    //         <path d="M11 18l-2 -1l-6 3v-13l6 -3l6 3l6 -3v7.5" />
    //         <path d="M9 4v13" />
    //         <path d="M15 7v5" />
    //         <path d="M18 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
    //         <path d="M20.2 20.2l1.8 1.8" />
    //       </svg>
    //     ),
    //     active: pathname == '/physicalDocuments',
    //   },
  ].filter(Boolean); // Filter out any false values

  useEffect(() => {
    const getRecommendationLength = async () => {
      try {
        const response = await getRecommendations();
        console.log(response);
        setRecommendationsLength(response?.data?.recommendations?.length);
      } catch (error) {
        console.log(error);
      }
    };
    getRecommendationLength();
  }, []);
  return (
    <aside
      ref={sidebar}
      style={{
        width: '280px',
        // background: 'linear-gradient(63deg, #08203e, #557c93)',
      }}
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
              if (route.dropdown) {
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
                              ? setOpen((prev) =>
                                  prev === route.path ? '' : route.path,
                                )
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
                            {route.dropdown.map((subRoute, subIndex) => (
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
                  {route.path === '/recommendations' &&
                    recommendationsLength > 0 && (
                      <span className="ml-2 rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
                        {recommendationsLength}
                        {console.log(recommendationsLength)}
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
