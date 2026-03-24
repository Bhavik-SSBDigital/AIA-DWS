import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Stack, TextField, Button, CircularProgress } from '@mui/material';
import axios from 'axios';
import { toast } from 'react-toastify';

const ForgotPass: React.FC = () => {
  const navigate = useNavigate();
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  const [data, setData] = useState({
    username: '',
    email: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setData({ ...data, [e.target.name]: e.target.value });
  };
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const url = `${backendUrl}/forgetPassword`;
      const res = await axios.post(url, data);
      if (res.status === 200) {
        toast.success(res?.data?.message || 'Email Sent');
        navigate('/auth/signin');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "An error occurred");
      // VAPT FIX #18: Removed console.log(error.message) to prevent info leakage
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      height="100vh"
      width="100vw"
    >
      <div
        style={{ padding: '20px', width: '80vw', maxWidth: '500px' }}
        className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark"
      >
        <h2 className="mb-9 text-2xl font-bold text-black dark:text-white sm:text-title-xl2">
          Forgot Password
        </h2>
        <form onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <TextField
              label="Username"
              name="username"
              value={data.username}
              onChange={handleChange}
              fullWidth
              required
              autoComplete="username" // VAPT FIX #18
            />
            <TextField
              label="Email"
              name="email"
              value={data.email}
              onChange={handleChange}
              fullWidth
              required
              autoComplete="email" // VAPT FIX #18
              error={
                !!data.email &&
                !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(data.email)
              }
              helperText={
                !!data.email &&
                !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(data.email)
                  ? 'Invalid email address'
                  : ''
              }
            />
            <Stack
              direction="row"
              spacing={2}
              justifyContent="space-between"
              alignItems="center"
            >
              <Link
                to="/auth/signin"
                className="text-sm text-indigo-600 hover:text-indigo-500"
              >
                Back to sign in
              </Link>
              <Button type="submit" variant="contained" color="primary">
                {loading ? (
                  <CircularProgress sx={{ color: 'white' }} size={24} />
                ) : (
                  'Submit'
                )}
              </Button>
            </Stack>
          </Stack>
        </form>
      </div>
    </Stack>
  );
};

export default ForgotPass;