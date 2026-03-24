import { useEffect, useState } from 'react';
import { Route, Routes, useLocation, useNavigate, Navigate } from 'react-router-dom';
import Loader from './common/Loader';
import PageTitle from './components/PageTitle';
import Profile from './pages/Profile';
import BranchList from './pages/Branches/List';
import UserList from './pages/Users/List';
import RolesList from './pages/Roles/List';
import WorkList from './pages/Processes/List';
import DepartmentList from './pages/Department/List';
import NewBranch from './pages/Branches/NewBranch';
import TagsMasterPage from './master/tags';
import NewUser from './pages/Users/NewUser';
import NewRole from './pages/Roles/NewRole';
import NewDepartment from './pages/Department/NewDepartment';
import FileSystem from './pages/FileSystem';
import SignIn from './pages/Authentication/SignIn';
import SignUp from './pages/Authentication/SignUp';
import ViewProcess from './pages/Processes/ViewProcess';
import ProcessInitForm from './pages/Processes/InitiateProcess';
import { useDispatch } from 'react-redux';
import { onReload } from './Slices/PathSlice';
import NotFoundPage from './pages/404/NotFoundPage';
import DefaultLayout from './layout/DefaultLayout';
import ForgotPass from './pages/Authentication/ForgotPass';
import PhysicalDocuments from './pages/PhysicalDocuments/PhysicalDocuments';
import SearchDocument from './pages/SearchDocuments/SearchDocument';
import MeetingManager from './pages/Meeting';
// import ForgotPassword from './pages/Authentication/ForgotPassword';
import ChangePassword from './pages/Authentication/ChangePassword';
import MetaData from './pages/MetaData';
import Workflows from './pages/workflows';
import RecycleBin from './pages/RecycleBin';
import Recommendations from './pages/Recommendations';
import ViewRecommendation from './pages/Recommendations/ViewRecommendation';
import Logs from './pages/Logs/List';
import ViewLog from './pages/Logs/ViewLog';
import Dashboard from './pages/Dashboard';
import TimelinePage from './pages/Timeline/TimelinePage';
import Archive from './pages/Archive';
import Templates from './pages/Templates';
import CompletedProcesses from './pages/Processes/CompletedProcesses';
import Bookmark from './pages/Bookmark';
import AdminReportsPage from './pages/Reports';
import AutoLoginHandler from './components/AutoLoginHandler';

// ✅ VAPT FIX #20: Route Guard to prevent Client-Side Auth Bypass
const AdminRoute = ({ children }: { children: JSX.Element }) => {
  const isAdmin = sessionStorage.getItem('isAdmin') === 'true';
  const isRootUser = sessionStorage.getItem('specialUser') === 'true';

  if (!isAdmin && !isRootUser) {
    // If they aren't admin, kick them back to the dashboard immediately
    return <Navigate to="/" replace />;
  }

  return children;
};

function App() {
  const dispatch = useDispatch();
  const [loading, setLoading] = useState<boolean>(true);
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
    if (!pathname.includes('files')) {
      dispatch(onReload('..'));
    }
  }, [pathname, dispatch]);

  useEffect(() => {
    setTimeout(() => setLoading(false), 1000);
  }, []);

  const navigate = useNavigate();
  useEffect(() => {
    const isAutoLogin = pathname === '/auth/auto-login';
    if (isAutoLogin) return;

    const token = sessionStorage.getItem('accessToken');
    if (!token && !pathname.includes('/auth/')) {
      navigate('/auth/signin');
    }

    // Block right-click context menu
    const preventContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Block PrintScreen and Ctrl/Cmd + P
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key;

      // Block PrintScreen key
      if (key === 'PrintScreen') {
        e.preventDefault();
        alert('Screenshots are not allowed.');
        document.body.style.filter = 'blur(10px)';
        setTimeout(() => {
          document.body.style.filter = 'none';
        }, 1000);
      }

      // Block Ctrl/Cmd + P
      if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === 'p') {
        e.preventDefault();
        alert('Printing is disabled.');
      }
    };

    // Register events
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', preventContextMenu);

    // Cleanup on unmount
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', preventContextMenu);
    };
  }, [navigate, pathname]);

  return loading ? (
    <Loader />
  ) : (
    <>
      <Routes>
        <Route path="/auth/auto-login" element={<AutoLoginHandler />} />
        
        {/* ======================================= */}
        {/* PUBLIC / STANDARD AUTHENTICATED ROUTES  */}
        {/* ======================================= */}
        <Route
          index
          element={
            <DefaultLayout>
              <PageTitle title="Dashboard | Overall" />
              <Dashboard />
            </DefaultLayout>
          }
        />
        <Route
          path="/timeline/:id"
          element={
            <DefaultLayout>
              <PageTitle title="Timeline" />
              <TimelinePage />
            </DefaultLayout>
          }
        />
        <Route
          path="/files"
          element={
            <DefaultLayout>
              <PageTitle title="Files" />
              <FileSystem />
            </DefaultLayout>
          }
        />
        <Route
          path="/bin"
          element={
            <DefaultLayout>
              <PageTitle title="Recycle Bin" />
              <RecycleBin />
            </DefaultLayout>
          }
        />
        <Route
          path="/archive"
          element={
            <DefaultLayout>
              <PageTitle title="Archive Files" />
              <Archive />
            </DefaultLayout>
          }
        />
        <Route
          path="/change-password"
          element={
            <DefaultLayout>
              <PageTitle title="Change Password" />
              <ChangePassword />
            </DefaultLayout>
          }
        />
        <Route
          path="/bookmark"
          element={
            <DefaultLayout>
              <PageTitle title="Bookmarked Files" />
              <Bookmark />
            </DefaultLayout>
          }
        />
        <Route
          path="/Search"
          element={
            <DefaultLayout>
              <PageTitle title="Search Document" />
              <SearchDocument />
            </DefaultLayout>
          }
        />
        <Route
          path="/physical-document"
          element={
            <DefaultLayout>
              <PageTitle title="Physical Documents" />
              <PhysicalDocuments />
            </DefaultLayout>
          }
        />
        <Route
          path="/processes/work"
          element={
            <DefaultLayout>
              <PageTitle title="Work List" />
              <WorkList />
            </DefaultLayout>
          }
        />
        <Route
          path="/processes/completed"
          element={
            <DefaultLayout>
              <PageTitle title="Completed Processes" />
              <CompletedProcesses />
            </DefaultLayout>
          }
        />
        <Route
          path="/logs"
          element={
            <DefaultLayout>
              <PageTitle title="Logs" />
              <Logs />
            </DefaultLayout>
          }
        />
        <Route
          path="/logs/:id"
          element={
            <DefaultLayout>
              <PageTitle title="View Log" />
              <ViewLog />
            </DefaultLayout>
          }
        />
        <Route
          path="/recommendations"
          element={
            <DefaultLayout>
              <PageTitle title="Recommendations" />
              <Recommendations />
            </DefaultLayout>
          }
        />
        <Route
          path="/recommendation/:id"
          element={
            <DefaultLayout>
              <PageTitle title="View Recommedation" />
              <ViewRecommendation />
            </DefaultLayout>
          }
        />
        <Route
          path="/process/view/:id"
          element={
            <DefaultLayout>
              <PageTitle title="View Process" />
              <ViewProcess />
            </DefaultLayout>
          }
        />
        <Route
          path="/processes/initiate"
          element={
            <DefaultLayout>
              <PageTitle title="Initiate Process" />
              <ProcessInitForm />
            </DefaultLayout>
          }
        />
        <Route
          path="/profile"
          element={
            <DefaultLayout>
              <PageTitle title="Profile" />
              <Profile />
            </DefaultLayout>
          }
        />
        <Route
          path="/meeting-manager"
          element={
            <DefaultLayout>
              <PageTitle title="Meeting" />
              <MeetingManager />
            </DefaultLayout>
          }
        />
        <Route
          path="/meta-data"
          element={
            <DefaultLayout>
              <PageTitle title="meta-data" />
              <MetaData />
            </DefaultLayout>
          }
        />
        <Route
          path="/workflows"
          element={
            <DefaultLayout>
              <PageTitle title="Workflows" />
              <Workflows />
            </DefaultLayout>
          }
        />
        <Route
          path="/templates/:id"
          element={
            <DefaultLayout>
              <PageTitle title="Templates" />
              <Templates />
            </DefaultLayout>
          }
        />

        {/* ======================================= */}
        {/* SECURE ADMIN ROUTES (VAPT FIX #20)      */}
        {/* ======================================= */}

        <Route
          path="/reports"
          element={
            <AdminRoute>
              <DefaultLayout>
                <PageTitle title="Reports" />
                <AdminReportsPage />
              </DefaultLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/branches/list"
          element={
            <AdminRoute>
              <DefaultLayout>
                <PageTitle title="Branches List" />
                <BranchList />
              </DefaultLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/branches/createNew"
          element={
            <AdminRoute>
              <DefaultLayout>
                <PageTitle title="Create Branch" />
                <NewBranch />
              </DefaultLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/master/tags"
          element={
            <AdminRoute>
              <DefaultLayout>
                <PageTitle title="Tags" />
                <TagsMasterPage />
              </DefaultLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/branches/edit/:id"
          element={
            <AdminRoute>
              <DefaultLayout>
                <PageTitle title="Edit Branch" />
                <NewBranch />
              </DefaultLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/users/list"
          element={
            <AdminRoute>
              <DefaultLayout>
                <PageTitle title="Users List" />
                <UserList />
              </DefaultLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/users/edit/:id"
          element={
            <AdminRoute>
              <DefaultLayout>
                <PageTitle title="Edit User" />
                <NewUser />
              </DefaultLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/users/createNew"
          element={
            <AdminRoute>
              <DefaultLayout>
                <PageTitle title="Create User" />
                <NewUser />
              </DefaultLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/roles/list"
          element={
            <AdminRoute>
              <DefaultLayout>
                <PageTitle title="Roles List" />
                <RolesList />
              </DefaultLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/roles/createNew"
          element={
            <AdminRoute>
              <DefaultLayout>
                <PageTitle title="Create role" />
                <NewRole />
              </DefaultLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/roles/edit/:id"
          element={
            <AdminRoute>
              <DefaultLayout>
                <PageTitle title="Edit Role" />
                <NewRole />
              </DefaultLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/departments/list"
          element={
            <AdminRoute>
              <DefaultLayout>
                <PageTitle title="Department List" />
                <DepartmentList />
              </DefaultLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/departments/createNew"
          element={
            <AdminRoute>
              <DefaultLayout>
                <PageTitle title="Create Department" />
                <NewDepartment />
              </DefaultLayout>
            </AdminRoute>
          }
        />
        <Route
          path="/departments/edit/:id"
          element={
            <AdminRoute>
              <DefaultLayout>
                <PageTitle title="Edit Role" />
                <NewDepartment />
              </DefaultLayout>
            </AdminRoute>
          }
        />

        {/* ======================================= */}
        {/* UNAUTHENTICATED ROUTES                  */}
        {/* ======================================= */}

        <Route
          path="/auth/signin"
          element={
            <>
              <PageTitle title="Signin" />
              <SignIn />
            </>
          }
        />
        <Route
          path="/auth/signup"
          element={
            <>
              <PageTitle title="Signup" />
              <SignUp />
            </>
          }
        />
        <Route
          path="/auth/forgot"
          element={
            <>
              <PageTitle title="Forgot Password" />
              <ForgotPass />
            </>
          }
        />
        
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}

export default App;