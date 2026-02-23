import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { backButtonPath, setPath } from '../../Slices/PathSlice';
import { useDispatch } from 'react-redux';
import sessionData from '../../Store';
import axios from 'axios';
import { Stack } from '@mui/material';
import { toast } from 'react-toastify';
import { LogOut } from '../../common/Apis';

const DropdownUser = () => {
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { profileImage, setProfileImage, setAlerts, setNotifications } =
    sessionData();
  const trigger = useRef<any>(null);
  const dropdown = useRef<any>(null);

  // close on click outside
  useEffect(() => {
    const clickHandler = ({ target }: MouseEvent) => {
      if (!dropdown.current) return;
      if (
        !dropdownOpen ||
        dropdown.current.contains(target) ||
        trigger.current.contains(target)
      )
        return;
      setDropdownOpen(false);
    };
    document.addEventListener('click', clickHandler);
    return () => document.removeEventListener('click', clickHandler);
  });

  // close if the esc key is pressed
  useEffect(() => {
    const keyHandler = ({ keyCode }: KeyboardEvent) => {
      if (!dropdownOpen || keyCode !== 27) return;
      setDropdownOpen(false);
    };
    document.addEventListener('keydown', keyHandler);
    return () => document.removeEventListener('keydown', keyHandler);
  });

  const resetStore = sessionData((state) => state.reset);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const handleLogout = async () => {
    try {
      const response = await LogOut();
      toast.success(response?.data?.message);
      resetStore();
      setNotifications([]);
      setAlerts([]);
      setProfileImage('');
      dispatch(setPath('..'));
      dispatch(backButtonPath('..'));
      navigate('/auth/signin');
      sessionStorage.clear();
    } catch (error) {
      toast?.error(error?.response?.data?.error || error?.message);
    }
  };

  const fetchProfilePic = async () => {
    try {
      const url = backendUrl + '/getUserProfilePic';
      const accessToken = sessionStorage.getItem('accessToken');
      const response = await axios.post(url, null, {
        headers: {
          Authorization: ` Bearer ${accessToken}`,
        },
        responseType: 'blob',
      });

      if (response.status === 200) {
        const blob = new Blob([response.data], {
          type: response.headers['content-type'],
        });
        const objectURL = URL.createObjectURL(blob);
        setProfileImage(objectURL);
      } else {
        console.error('Error fetching profile picture:', response.statusText);
      }
    } catch (error) {
      console.error('Error fetching profile picture:', error.message);
    }
  };

  useEffect(() => {
    fetchProfilePic();
  }, []);

  const username = sessionStorage.getItem('username');

  return (
    <div className="relative" style={{ userSelect: 'none' }}>
      <Stack
        flexDirection="row"
        alignItems="center"
        onClick={() => setDropdownOpen(!dropdownOpen)}
      >
        <div
          style={{
            display: 'flex',
            position: 'relative',
            justifyContent: 'center',
            alignItems: 'center',
            height: '50px',
            width: '50px',
            background: '#EFF4FB',
            borderRadius: '50%',
            border: '1px solid lightgray',
          }}
        >
          <span className="h-12 w-12 rounded-full">
            {profileImage ? (
              <img
                src={profileImage}
                alt="User"
                style={{
                  height: '100%',
                  width: '100%',
                  borderRadius: '50%',
                  border: '1px solid lightgray',
                }}
              />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M12 2a5 5 0 1 1 -5 5l.005 -.217a5 5 0 0 1 4.995 -4.783z" />
                <path d="M14 14a5 5 0 0 1 5 5v1a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-1a5 5 0 0 1 5 -5h4z" />
              </svg>
            )}
          </span>
        </div>
      </Stack>

      {/* Dropdown Overlay */}
      {dropdownOpen && (
        <div
          className="fixed inset-0 bg-black opacity-0"
          onClick={() => setDropdownOpen(false)}
          style={{ height: '100vh', width: '100vw' }}
        ></div>
      )}

      <div
        ref={dropdown}
        onFocus={() => setDropdownOpen(true)}
        onBlur={() => setDropdownOpen(false)}
        className={`absolute right-0 mt-4 flex w-60 flex-col rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark ${
          dropdownOpen === true ? 'block' : 'hidden'
        }`}
      >
        <span className="block text-right p-2 border-b-2">
          <span className="block text-lg font-medium text-black dark:text-white text-center">
            <h2>{username}</h2>
          </span>
        </span>

        <ul className="flex flex-col gap-5 border-b border-stroke px-6 py-5 dark:border-strokedark">
          {/* My Profile */}
          <li>
            <Link
              to="/profile"
              onClick={() => setDropdownOpen(false)}
              className="flex items-center gap-3.5 text-sm font-medium duration-300 ease-in-out hover:text-primary lg:text-base"
            >
              <svg
                className="fill-current"
                width="22"
                height="22"
                viewBox="0 0 22 22"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M11 9.62499C8.42188 9.62499 6.35938 7.59687 6.35938 5.12187C6.35938 2.64687 8.42188 0.618744 11 0.618744C13.5781 0.618744 15.6406 2.64687 15.6406 5.12187C15.6406 7.59687 13.5781 9.62499 11 9.62499ZM11 2.16562C9.28125 2.16562 7.90625 3.50624 7.90625 5.12187C7.90625 6.73749 9.28125 8.07812 11 8.07812C12.7188 8.07812 14.0938 6.73749 14.0938 5.12187C14.0938 3.50624 12.7188 2.16562 11 2.16562Z"
                  fill=""
                />
                <path
                  d="M17.7719 21.4156H4.2281C3.5406 21.4156 2.9906 20.8656 2.9906 20.1781V17.0844C2.9906 13.7156 5.7406 10.9656 9.10935 10.9656H12.925C16.2937 10.9656 19.0437 13.7156 19.0437 17.0844V20.1781C19.0094 20.8312 18.4594 21.4156 17.7719 21.4156ZM4.53748 19.8687H17.4969V17.0844C17.4969 14.575 15.4344 12.5125 12.925 12.5125H9.07498C6.5656 12.5125 4.5031 14.575 4.5031 17.0844V19.8687H4.53748Z"
                  fill=""
                />
              </svg>
              My Profile
            </Link>
          </li>

          {/* Change Password */}
          <li>
            <Link
              to="/change-password"
              onClick={() => setDropdownOpen(false)}
              className="flex items-center gap-3.5 text-sm font-medium duration-300 ease-in-out hover:text-primary lg:text-base"
            >
              <svg
                className="fill-current"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 2C8.13 2 5 5.13 5 9v3c0 .78.16 1.53.46 2.22L3.7 16.7c-.44.88-.1 2.05.78 2.49.22.11.46.17.72.17h.5c0 1.1.9 2 2 2h.8c.11.6.5 1.07 1 1.37V21c0 1.1.9 2 2 2s2-.9 2-2v-.27c.5-.3.89-.77 1-1.37h.8c1.1 0 2-.9 2-2h.5c.26 0 .5-.06.72-.17.88-.44 1.22-1.61.78-2.49l-1.76-2.48c.3-.69.46-1.44.46-2.22V9c0-3.87-3.13-7-7-7zm-3 15h6v2h-6v-2zm3-10c1.1 0 2 .9 2 2v1h-4v-1c0-1.1.9-2 2-2z"
                  fill=""
                />
              </svg>
              Change Password
            </Link>
          </li>

          {/* Forgot Password */}
          {/* <li>
            <Link
              to="/auth/forgot"
              onClick={() => setDropdownOpen(false)}
              className="flex items-center gap-3.5 text-sm font-medium duration-300 ease-in-out hover:text-primary lg:text-base"
            >
              <svg
                className="fill-current"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 2C8.13 2 5 5.13 5 9v3c0 2.38 1.19 4.47 3 5.74V18c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2v-.26c1.81-1.27 3-3.36 3-5.74V9c0-3.87-3.13-7-7-7z"
                  fill=""
                />
                <path d="M0 0h24v24H0z" fill="none" />
              </svg>
              Forgot Password
            </Link>
          </li> */}
        </ul>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3.5 px-6 py-4 text-sm font-medium duration-300 ease-in-out hover:text-primary lg:text-base"
        >
          <svg
            className="fill-current"
            width="22"
            height="22"
            viewBox="0 0 22 22"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M15.5375 0.618744H11.6531C10.7594 0.618744 10.0031 1.37499 10.0031 2.26874V4.64062C10.0031 5.05312 10.3469 5.39687 10.7594 5.39687C11.1719 5.39687 11.55 5.05312 11.55 4.64062V2.23437C11.55 2.16562 11.5844 2.13124 11.6531 2.13124H15.5375C16.3625 2.13124 17.0156 2.78437 17.0156 3.60937V18.3562C17.0156 19.1812 16.3625 19.8344 15.5375 19.8344H11.6531C11.5844 19.8344 11.55 19.8 11.55 19.7312V17.3594C11.55 16.9469 11.2062 16.6031 10.7594 16.6031C10.3125 16.6031 10.0031 16.9469 10.0031 17.3594V19.7312C10.0031 20.625 10.7594 21.3812 11.6531 21.3812H15.5375C17.2219 21.3812 18.5625 20.0062 18.5625 18.3562V3.64374C18.5625 1.95937 17.1875 0.618744 15.5375 0.618744Z"
              fill=""
            />
            <path
              d="M6.05001 11.7563H12.2031C12.6156 11.7563 12.9594 11.4125 12.9594 11C12.9594 10.5875 12.6156 10.2438 12.2031 10.2438H6.08439L8.21564 8.07813C8.52501 7.76875 8.52501 7.2875 8.21564 6.97812C7.90626 6.66875 7.42501 6.66875 7.11564 6.97812L3.67814 10.4844C3.36876 10.7938 3.36876 11.275 3.67814 11.5844L7.11564 15.0906C7.25314 15.2281 7.45939 15.3312 7.66564 15.3312C7.87189 15.3312 8.04376 15.2625 8.21564 15.125C8.52501 14.8156 8.52501 14.3344 8.21564 14.025L6.05001 11.7563Z"
              fill=""
            />
          </svg>
          Log Out
        </button>
      </div>
    </div>
  );
};

export default DropdownUser;