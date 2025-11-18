import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import CustomCard from '../../CustomComponents/CustomCard';
import ComponentLoader from '../../common/Loader/ComponentLoader';
import CustomButton from '../../CustomComponents/CustomButton';
import TopLoader from '../../common/Loader/TopLoader';
import { IconArrowLeft } from '@tabler/icons-react';
import { viewLog } from '../../common/Apis';
import Timeline from '../Timeline';

const ViewLog = () => {
  // variables
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [data, setData] = useState();

  // handlers
  // const handleBack = () => {
  //   navigate(-1);
  // };

  // network
  const fetchData = async () => {
    try {
      const response = await viewLog(id);
      setData(response?.data?.process);
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  // initials
  // const logDetails = [
  //   { label: 'Process ID', value: data?.processId || '--' },
  //   { label: 'Process Name', value: data?.processName || '--' },
  // ];
  if (loading) return <ComponentLoader />;
  if (error)
    return (
      <CustomCard>
        <p className="text-lg font-semibold">Error: {error}</p>
        <div className="mt-4 flex space-x-4">
          <CustomButton
            click={() => navigate('/processes/work')}
            text={'Go Back'}
          />
        </div>
      </CustomCard>
    );

  if (!data)
    return (
      <div className="text-center text-gray-500 py-10">
        No logs data available
      </div>
    );

  return (
    <div className="mx-auto">
      {actionsLoading && <TopLoader />}

      {/* details */}
      {/* <CustomCard>
        <div className="flex justify-end flex-row gap-2 flex-wrap">
          <CustomButton
            variant={'none'}
            text={
              <div className="flex items-center  gap-2">
                <IconArrowLeft size={18} /> List
              </div>
            }
            click={handleBack}
            disabled={actionsLoading}
          />
        </div>
        <hr className="text-slate-200 my-2" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {logDetails.map((detail, index) => (
            <div
              key={index}
              className="p-4 border border-slate-300 bg-zinc-50 rounded-lg shadow-sm"
            >
              <p className="font-semibold text-lg">{detail.label}</p>
              <p>{detail.value}</p>
            </div>
          ))}

          {data?.documentVersioning && DocumentsCycle(data)}
        </div>
      </CustomCard> */}
      <div>
        <Timeline
          activities={data?.activities}
          actionsLoading={actionsLoading}
          setActionsLoading={setActionsLoading}
          workflow={data?.workflow?.steps}
          process={data}
          reOpen={data?.isInitiator}
        />
      </div>
    </div>
  );
};

export default ViewLog;
