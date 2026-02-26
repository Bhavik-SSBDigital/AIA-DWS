import { useEffect, useState } from 'react';
import { GetNotifications } from '../../common/Apis';
import CustomButton from '../../CustomComponents/CustomButton';
import { useNavigate } from 'react-router-dom';

const DropdownNotification = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const navigate = useNavigate();

  const getNotifications = async () => {
    try {
      const res = await GetNotifications();
      if (res.status === 200) {
        const now = new Date();

        const filtered = (res.data || []).filter((n) => {
          const createdAt = new Date(n.createdAt);
          const diffInDays =
            (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
          return diffInDays <= 15;
        });

        setNotifications(filtered);
        // const sorted = filtered.sort((a, b) => {
        //   if (a.isRejected === b.isRejected) {
        //     return new Date(b.createdAt) - new Date(a.createdAt);
        //   }
        //   return a.isRejected ? -1 : 1;
        // });

        // setNotifications(sorted);
      }
    } catch (error) {
      console.error('Failed to fetch notifications', error);
    }
  };

  const handleView = (id) => {
    navigate(`/process/view/${id}`);
    setDropdownOpen(false);
  };

  useEffect(() => {
    getNotifications();
  }, []);

  return (
    <li className="relative">
      {/* Notification Icon */}
      <div
        className="relative flex justify-center items-center h-[38px] w-[38px] bg-[#EFF4FB] border border-gray-300 rounded-full cursor-pointer hover:bg-gray-100 transition"
        onClick={() => setDropdownOpen((prev) => !prev)}
      >
        {notifications.length > 0 && (
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 animate-pulse"></span>
        )}

        <svg
          className="fill-current text-gray-700"
          width="20"
          height="20"
          viewBox="0 0 18 18"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M16.2 14.93L15.64 14.06C15.52 13.89 15.47 13.72 15.47 13.53V7.68C15.47 6.02 14.77 4.47 13.47 3.32C12.43 2.39 11.08 1.8 9.65 1.69V1.12C9.65 0.79 9.37 0.48 9 0.48C8.66 0.48 8.35 0.76 8.35 1.12V1.66C4.92 2.05 2.47 4.67 2.47 7.79V13.53C2.45 13.81 2.39 13.95 2.33 14.03L1.8 14.93C1.63 15.22 1.63 15.55 1.8 15.83C1.97 16.09 2.25 16.26 2.56 16.26H8.38V16.87C8.38 17.21 8.66 17.52 9.03 17.52C9.37 17.52 9.67 17.24 9.67 16.87V16.26H15.47C15.78 16.26 16.06 16.09 16.23 15.83C16.4 15.55 16.4 15.22 16.2 14.93Z" />
        </svg>
      </div>

      {/* Background Overlay */}
      {dropdownOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setDropdownOpen(false)}
        />
      )}

      {/* Dropdown Panel */}
      <div
        className={`absolute right-0 z-50 mt-3 w-96 rounded-xl border overflow-hidden border-gray-200 bg-white shadow-xl transition-all duration-200 ${
          dropdownOpen
            ? 'opacity-100 visible translate-y-0'
            : 'opacity-0 invisible -translate-y-3'
        }`}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100">
          <h5 className="text-sm font-semibold text-gray-800">Notifications</h5>
          <p className="text-xs text-gray-500 mt-1">Last 15 days updates</p>
        </div>

        {/* Notification List */}
        <ul className="max-h-[400px] overflow-y-auto divide-y divide-gray-100">
          {notifications.length > 0 ? (
            notifications.map((item) => (
              <li
                key={item.processId}
                className={`px-5 py-4 transition-all duration-200 cursor-pointer
                ${
                  item.isRejected
                    ? 'bg-red-50 hover:bg-red-100'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1">
                    <p
                      className={`text-sm font-semibold ${
                        item.isRejected ? 'text-red-600' : 'text-gray-900'
                      }`}
                    >
                      {item.processName}
                    </p>

                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>

                  {item.isRejected && (
                    <span className="shrink-0 px-2.5 py-1 text-xs font-medium rounded-full bg-red-600 text-white">
                      Rejected
                    </span>
                  )}
                </div>

                <div className="mt-3">
                  <CustomButton
                    click={() => handleView(item.processId)}
                    text="View"
                  />
                </div>
              </li>
            ))
          ) : (
            <li className="px-6 py-12 text-center">
              <div className="text-sm text-gray-600 font-medium">
                No notifications
              </div>
              <div className="text-xs text-gray-400 mt-1">
                You're all caught up 🎉
              </div>
            </li>
          )}
        </ul>
      </div>
    </li>
  );
};

export default DropdownNotification;
