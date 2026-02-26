import React, { useEffect, useState } from 'react';
import {
  IconCheck,
  IconClock,
  IconFileText,
  IconX,
  IconRepeat,
  IconListDetails,
  IconBolt,
  IconListCheck,
} from '@tabler/icons-react';
import { toast } from 'react-toastify';
import { getDashboardNumbers, getDashboardTables } from '../../common/Apis';
import ComponentLoader from '../../common/Loader/ComponentLoader';
import TopLoader from '../../common/Loader/TopLoader';
import CustomCard from '../../CustomComponents/CustomCard';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import CustomButton from '../../CustomComponents/CustomButton';
import CardSkeleton from '../../common/Skeletons/CardSkeleton';
import CustomModal from '../../CustomComponents/CustomModal';
import WorkflowsTable from './Tables/WorkflowsTable';
import ProcessesTable from './Tables/ProcessesTable';
import SignedDocumentsTable from './Tables/SignedDocumentsTable';
import RejectedDocumentsTable from './Tables/RejectedDocumentsTable';
import ReplacedDocumentsTable from './Tables/ReplacedDocumentsTable';
import moment from 'moment';

export default function Dashboard() {
  // Calculate default date range: from one year ago to today
  const today = new Date();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(today.getFullYear() - 1);

  // Format date to yyyy-mm-dd string
  const formatDate = (date) => date.toISOString().slice(0, 10);

  // state and variables - dates as an object
  const [dates, setDates] = useState({
    startDate: formatDate(oneYearAgo),
    endDate: formatDate(today),
  });
  const [data, setData] = useState(null);
  const [lists, setLists] = useState({
    workflows: [],
    activeWorkflows: [],
    completedProcesses: [],
    pendingProcesses: [],
    signedDocuments: [],
    rejectedDocuments: [],
    replacedDocuments: [],
  });
  const [actionsLoading, setActionsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState('');

  const iconMap = {
    'Total Workflows': <IconListDetails size={28} className="text-blue-500" />,
    'Active Workflows': <IconBolt size={28} className="text-green-500" />,
    'Completed Processes': <IconCheck size={28} className="text-indigo-500" />,
    'Pending Processes': <IconClock size={28} className="text-yellow-500" />,
    'Signed Documents': <IconFileText size={28} className="text-green-600" />,
    'Rejected Documents': <IconX size={28} className="text-red-500" />,
    'Replaced Documents': <IconRepeat size={28} className="text-purple-500" />,
    'Avg Step Time (hrs)': (
      <IconListCheck size={28} className="text-gray-600" />
    ),
  };

  const graphData = [
    {
      name: 'Workflows',
      Total: data?.totalWorkflows,
      Active: data?.activeWorkflows,
    },
    {
      name: 'Processes',
      Completed: data?.completedProcesses,
      Pending: data?.pendingProcesses,
    },
    {
      name: 'Documents',
      Signed: data?.signedDocuments,
      Rejected: data?.rejectedDocuments,
      Replaced: data?.replacedDocuments,
    },
    {
      name: 'Queries',
      Total: data?.queries.total,
      Solved: data?.queries.solved,
    },
  ];

  // handlers
  const renderCardContent = (title, value) => {
    return loading ? (
      <CardSkeleton />
    ) : (
      <div className="flex items-center">
        <div className="p-3 bg-gray-100 rounded-full mr-4">
          {iconMap[title]}
        </div>
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <h3 className="text-2xl font-semibold text-gray-900">{value}</h3>
        </div>
      </div>
    );
  };

  // network
  const nextDay = moment(dates.endDate).add(1, 'days').format('YYYY-MM-DD');
  const getNumbers = async () => {
    try {
      const response = await getDashboardNumbers(dates.startDate, nextDay);
      setData(response?.data?.data);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    }
  };
  const getLists = async () => {
    try {
      const response = await getDashboardTables(dates.startDate, nextDay);
      setLists(response?.data?.data);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    }
  };
  const getDashboardData = async () => {
    setActionsLoading(true);
    await getNumbers();
    await getLists();
    setLoading(false);
    setActionsLoading(false);
  };

  useEffect(() => {
    getDashboardData();
  }, []);

  return (
    <>
      {(loading || actionsLoading) && <TopLoader />}
      <div className="p-6 space-y-4">
        {/* Date range selectors */}
        <div className="flex flex-col md:flex-row md:items-center md:space-x-4">
          <div>
            <label
              htmlFor="startDate"
              className="block text-sm font-medium text-gray-700"
            >
              Start Date
            </label>
            <input
              type="date"
              id="startDate"
              value={dates.startDate}
              max={dates.endDate}
              onChange={(e) =>
                setDates((prev) => ({ ...prev, startDate: e.target.value }))
              }
              className="border border-zinc-300 p-2.5 w-full rounded-md"
            />
          </div>
          <div>
            <label
              htmlFor="endDate"
              className="block text-sm font-medium text-gray-700"
            >
              End Date
            </label>
            <input
              type="date"
              id="endDate"
              value={dates.endDate}
              min={dates.startDate}
              max={formatDate(today)}
              onChange={(e) =>
                setDates((prev) => ({ ...prev, endDate: e.target.value }))
              }
              className="border border-zinc-300 p-2.5 w-full rounded-md"
            />
          </div>
          <CustomButton
            disabled={actionsLoading}
            click={getDashboardData}
            className="mt-5"
            text={'Search'}
          ></CustomButton>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <CustomCard
            className="cursor-pointer hover:shadow-md"
            title="Total Workflows"
            onClick={() => setOpenModal('workflows')}
          >
            {renderCardContent('Total Workflows', data?.totalWorkflows)}
          </CustomCard>

          <CustomCard
            className="cursor-pointer hover:shadow-md"
            title="Active Workflows"
            onClick={() => setOpenModal('activeWorkflows')}
          >
            {renderCardContent('Active Workflows', data?.activeWorkflows)}
          </CustomCard>

          <CustomCard
            className="cursor-pointer hover:shadow-md"
            title="Completed Processes"
            onClick={() => setOpenModal('completedProcesses')}
          >
            {renderCardContent('Completed Processes', data?.completedProcesses)}
          </CustomCard>

          <CustomCard
            className="cursor-pointer hover:shadow-md"
            title="Pending Processes"
            onClick={() => setOpenModal('pendingProcesses')}
          >
            {renderCardContent('Pending Processes', data?.pendingProcesses)}
          </CustomCard>

          <CustomCard
            className="cursor-pointer hover:shadow-md"
            title="Signed Documents"
            onClick={() => setOpenModal('signedDocuments')}
          >
            {renderCardContent('Signed Documents', data?.signedDocuments)}
          </CustomCard>

          <CustomCard
            className="cursor-pointer hover:shadow-md text-red-600 font-bold"
            title="Rejected Documents"
            onClick={() => setOpenModal('rejectedDocuments')}
          >
            {renderCardContent('Rejected Documents', data?.rejectedDocuments)}
          </CustomCard>

          <CustomCard
            className="cursor-pointer hover:shadow-md"
            title="Replaced Documents"
            onClick={() => setOpenModal('replacedDocuments')}
          >
            {renderCardContent('Replaced Documents', data?.replacedDocuments)}
          </CustomCard>

          <CustomCard
            className="cursor-pointer hover:shadow-md"
            title="Avg Step Time (hrs)"
            // onClick={() => setOpenModal('averageStepCompletionTimeHours')}
          >
            {renderCardContent(
              'Avg Step Time (hrs)',
              data?.averageStepCompletionTimeHours,
            )}
          </CustomCard>
        </div>

        <CustomCard>
          <h3 className="text-lg font-semibold mb-4">Process Overview</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={graphData}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="Total" fill="#3b82f6" />
              <Bar dataKey="Active" fill="#10b981" />
              <Bar dataKey="Completed" fill="#22c55e" />
              <Bar dataKey="Pending" fill="#f97316" />
              <Bar dataKey="Signed" fill="#6366f1" />
              <Bar dataKey="Rejected" fill="#ef4444" />
              <Bar dataKey="Replaced" fill="#facc15" />
              <Bar dataKey="Solved" fill="#14b8a6" />
            </BarChart>
          </ResponsiveContainer>
        </CustomCard>
      </div>
      <CustomModal
        isOpen={openModal == 'workflows'}
        onClose={() => setOpenModal('')}
      >
        <WorkflowsTable
          setActionsLoading={setActionsLoading}
          actionsLoading={actionsLoading}
          data={lists['workflows']}
          startDate={dates.startDate}
          endDate={nextDay}
        />
      </CustomModal>
      <CustomModal
        isOpen={openModal == 'activeWorkflows'}
        onClose={() => setOpenModal('')}
      >
        <WorkflowsTable
          setActionsLoading={setActionsLoading}
          actionsLoading={actionsLoading}
          data={lists['activeWorkflows']}
          startDate={dates.startDate}
          endDate={nextDay}
        />
      </CustomModal>
      <CustomModal
        isOpen={openModal == 'completedProcesses'}
        onClose={() => setOpenModal('')}
      >
        <ProcessesTable data={lists['completedProcesses']} />
      </CustomModal>
      <CustomModal
        isOpen={openModal == 'pendingProcesses'}
        onClose={() => setOpenModal('')}
      >
        <ProcessesTable data={lists['pendingProcesses']} />
      </CustomModal>
      <CustomModal
        isOpen={openModal == 'signedDocuments'}
        onClose={() => setOpenModal('')}
      >
        <SignedDocumentsTable
          setActionsLoading={setActionsLoading}
          actionsLoading={actionsLoading}
          data={lists['signedDocuments']}
        />
      </CustomModal>
      <CustomModal
        isOpen={openModal == 'rejectedDocuments'}
        onClose={() => setOpenModal('')}
      >
        <RejectedDocumentsTable
          setActionsLoading={setActionsLoading}
          actionsLoading={actionsLoading}
          data={lists['rejectedDocuments']}
        />
      </CustomModal>
      <CustomModal
        isOpen={openModal == 'replacedDocuments'}
        onClose={() => setOpenModal('')}
      >
        <ReplacedDocumentsTable
          setActionsLoading={setActionsLoading}
          actionsLoading={actionsLoading}
          data={lists['replacedDocuments']}
        />
      </CustomModal>
    </>
  );
}
