// components/AutoLoginHandler.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import sessionData from '../Store';

// import userSocket from '../Socket_Connection';
import { CircularProgress, Typography, Button, Stack } from '@mui/material';
const backendUrl = import.meta.env.VITE_BACKEND_URL;
const AutoLoginHandler = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const { setShow } = sessionData();




  useEffect(() => {
    const handleAutoLogin = async () => {
      try {
        const params = new URLSearchParams(location.search);
        const token = params.get('token');
        const redirect = params.get('redirect') || '/';

        if (!token) {
          setError('No login token provided');
          setLoading(false);
          navigate('/auth/signin');
          return;
        }

        // Call auto-login endpoint
        const response = await axios.get(`${backendUrl}/auto-login?token=${token}`);
        if (response.data.success) {
          const { accessToken, refreshToken, user, redirectUrl } = response.data;
          
          // Store tokens and user data (matching your SignIn component)
          sessionStorage.setItem('email', user.email);
          sessionStorage.setItem('username', user.userName);
          sessionStorage.setItem('accessToken', accessToken);
          sessionStorage.setItem('refreshToken', refreshToken);
          sessionStorage.setItem('isAdmin', user.isAdmin);
          sessionStorage.setItem('isDepartmentHead', user.isDepartmentHead);
          
          // Set admin show state
          if (user.isAdmin) {
            setShow(true);
          } else {
            setShow(false);
          }
          
          // Connect socket if needed
        
          
          // Redirect to the intended page
          navigate(redirectUrl || redirect);
        } else {
          setError('Auto-login failed');
          navigate('/auth/signin');
        }
      } catch (err) {
        console.error('Auto-login error:', err);
        const errorMessage = err.response?.data?.message || 'Auto-login failed. Please try logging in manually.';
        setError(errorMessage);
        
        // Don't navigate immediately, show error first
        setLoading(false);
      }
    };

    handleAutoLogin();
  }, [location, navigate, setShow]);

  if (loading) {
    return (
      <Stack
        alignItems="center"
        justifyContent="center"
        height="100vh"
        width="100vw"
      >
        <div className="text-center">
          <CircularProgress size={60} sx={{ color: '#3056D3', mb: 3 }} />
          <Typography variant="h6" color="textSecondary">
            Logging you in automatically...
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
            Please wait while we authenticate you.
          </Typography>
        </div>
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack
        alignItems="center"
        justifyContent="center"
        height="100vh"
        width="100vw"
      >
        <div className="text-center p-8 rounded-lg shadow-lg bg-white dark:bg-boxdark max-w-md">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <Typography variant="h6" color="error" sx={{ mb: 2 }}>
            Login Failed
          </Typography>
          <Typography variant="body1" color="textSecondary" sx={{ mb: 4 }}>
            {error}
          </Typography>
          <Button
            variant="contained"
            color="primary"
            onClick={() => navigate('/auth/signin')}
            fullWidth
            sx={{ mb: 2 }}
          >
            Go to Login Page
          </Button>
          <Button
            variant="outlined"
            onClick={() => window.location.reload()}
            fullWidth
          >
            Try Again
          </Button>
        </div>
      </Stack>
    );
  }

  return null;
};

export default AutoLoginHandler;