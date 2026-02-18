import CoverOne from '../assets/images/cover-01.png';
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import sessionData from '../Store';
import ComponentLoader from '../common/Loader/ComponentLoader';
import { GetProfileData, GetProfilePic, GetSignature } from '../common/Apis';
import CustomModal from '../CustomComponents/CustomModal';

const Profile = () => {
  const { profileImage, setProfileImage } = sessionData();
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const [userDetails, setUserDetails] = useState({
    departmentsInvolvedIn: [],
    email: '',
    roles: [],
    specialUser: '',
    username: '',
  });
  const [loading, setLoading] = useState(true);
  const [signatureViewModalOpen, setSignatureViewModalOpen] = useState(false);
  const fileInputRef = useRef();
  const [signatureImage, setSignatureImage] = useState('');
  const id = sessionStorage?.getItem('id');


  const fetchSignature = async () => {
    try {
      const response = await GetSignature(id);
      if (response.status === 200) {
        const blob = new Blob([response.data], {
          type: response.headers['content-type'],
        });
        setSignatureImage(URL.createObjectURL(blob));
      }
    } catch (error) {
      console.error('Error fetching signature:', error.message);
    }
  };

  const fetchProfilePic = async () => {
    try {
      const response = await GetProfilePic();
      if (response.status === 200) {
        const blob = new Blob([response.data], {
          type: response.headers['content-type'],
        });
        setProfileImage(URL.createObjectURL(blob));
      }
    } catch (error) {
      console.error('Error fetching profile picture:', error.message);
    }
  };

  const handleUpload = async (purpose, e) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowedFormats =
      purpose === 'signature'
        ? ['image/jpeg', 'image/png', 'image/gif']
        : purpose === 'profile'
          ? ['image/jpeg']
          : [
              'application/x-pkcs12',
              'application/x-x509-ca-cert',
              'application/x-pem-file',
            ];

    if (!allowedFormats.includes(file.type)) {
      toast.warning('Unsupported File Type');
      return;
    }

    try {
      const url = `${backendUrl}/uploadSignature`;
      const data = new FormData();
      data.append('purpose', purpose);
      data.append('userId', id);
      data.append('file', file);

      const res = await axios.post(url, data, {
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem('accessToken')}`,
          'Content-Type': 'multipart/form-data',
        },
      });

      if (res.status === 200) {
        if (purpose === 'signature') {
          fetchSignature();
        } else if (purpose === 'profile') {
          fetchProfilePic();
        } else if (purpose === 'dsc') {
          setUserDetails((prev) => ({
            ...prev,
            dscFileName: file.name,
          }));
        }

        toast.success(`File uploaded successfully for ${purpose}`);
      }
    } catch (error) {
      toast.error(`Error uploading image for ${purpose}`);
    }
  };

  useEffect(() => {
    (async () => {
      const res = await GetProfileData();
      setUserDetails(res.data.userdata);
      setLoading(false);
    })();
    fetchSignature();
  }, []);

  return (
    <>
      {loading ? (
        <ComponentLoader />
      ) : (
        <div className="flex flex-col gap-8 p-6 rounded-lg border bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 max-w-5xl mx-auto">
          {/* Section 1: Cover & Profile */}
          <section>
            <div className="relative h-48 md:h-64 w-full rounded-lg overflow-hidden">
              <img
                src={CoverOne}
                alt="profile cover"
                className="h-full w-full object-cover"
              />
            </div>

            <div className="flex flex-col md:flex-row items-center md:items-start gap-10 mt-6">
              {/* Profile Image */}
              <div className="flex flex-col items-center">
                <div className="relative h-40 w-40 rounded-full border bg-gray-200 shadow-lg overflow-hidden group">
                  {profileImage ? (
                    <img
                      src={profileImage}
                      alt="profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                      No Image
                    </div>
                  )}
                  <label className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <span className="text-sm">Change</span>
                    <input
                      type="file"
                      accept="image/jpeg"
                      onChange={(e) => handleUpload('profile', e)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </label>
                </div>
                <h3 className="mt-4 text-2xl font-semibold text-gray-900 dark:text-white">
                  {userDetails?.username || '---'}
                </h3>
              </div>

              {/* User Info */}
              <div className="flex-1 space-y-3 text-base text-gray-700 dark:text-gray-300">
                <p>
                  <strong>Department:</strong>{' '}
                  {userDetails?.departmentsInvolvedIn
                    ?.map((d) => d.departmentName)
                    .join(', ') || '---'}
                </p>
                <p>
                  <strong>Email:</strong> {userDetails.email || '---'}
                </p>
                <p>
                  <strong>Roles:</strong>{' '}
                  {userDetails.roles?.join(', ') || '---'}
                </p>
              </div>
            </div>
          </section>

          {/* Section 2: Signature */}
          <section className="border-t pt-6">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">
              Signature
            </h2>
            <div className="flex flex-col items-start gap-4">
              {signatureImage ? (
                <div className="flex items-center gap-4">
                  <strong className="text-green-600">Uploaded</strong>
                  <button
                    className="text-blue-600 underline"
                    onClick={() => setSignatureViewModalOpen(true)}
                  >
                    View Signature
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-red-600 bg-red-100 p-3 rounded-md border border-red-400">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-red-600"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.766-1.36 2.72-1.36 3.486 0l6.516 11.57c.746 1.324-.2 2.98-1.743 2.98H3.484c-1.543 0-2.49-1.656-1.743-2.98l6.516-11.57zM11 14a1 1 0 10-2 0 1 1 0 002 0zm-1-3a1 1 0 011-1v-2a1 1 0 10-2 0v2a1 1 0 011 1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <p className="font-semibold">
                    Signature not uploaded.
                  </p>
                  {/* <p className="font-semibold">
                    Signature is required. Please upload your signature.
                  </p> */}
                </div>
              )}
              {/* <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={(e) => handleUpload('signature', e)}
                className="border rounded p-2 w-full max-w-sm"
              /> */}
            </div>
          </section>

          {/* Section 3: DSC Upload */}
          {/* <section className="border-t pt-6">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4">
              DSC Certificate
            </h2>

            <div className="flex flex-col items-start gap-2 text-base text-gray-700 dark:text-gray-300">
              {userDetails?.dscFileName ? (
                <div className="flex items-center gap-2 text-green-700">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-green-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="font-medium">Current DSC:</span>
                  <span>{userDetails.dscFileName}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-red-600 bg-red-100 p-2 rounded-md border border-red-400">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-red-600"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.766-1.36 2.72-1.36 3.486 0l6.516 11.57c.746 1.324-.2 2.98-1.743 2.98H3.484c-1.543 0-2.49-1.656-1.743-2.98l6.516-11.57zM11 14a1 1 0 10-2 0 1 1 0 002 0zm-1-3a1 1 0 011-1v-2a1 1 0 10-2 0v2a1 1 0 011 1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>No DSC uploaded yet.</span>
                </div>
              )}

              <label className="mt-4 font-semibold">
                Upload New DSC Certificate:
              </label>
              <input
                type="file"
                onChange={(e) => handleUpload('dsc', e)}
                className="border rounded p-2 w-full max-w-sm"
              />
            </div>
          </section> */}
        </div>
      )}

      {/* Signature Modal */}
      <CustomModal
        isOpen={signatureViewModalOpen}
        onClose={() => setSignatureViewModalOpen(false)}
      >
        <img src={signatureImage} alt="signature" className="max-w-xs" />
      </CustomModal>
    </>
  );
};

export default Profile;
