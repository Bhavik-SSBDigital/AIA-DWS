import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  InputLabel,
  Stack,
  CircularProgress,
} from '@mui/material';
import { toast } from 'react-toastify';
import { forgotPassword } from '../../common/Apis'; // adjust path

const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ username: '', email: '' });
  const [errors, setErrors] = useState({ username: '', email: '' });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    // Clear error for this field
    setErrors({ ...errors, [e.target.name]: '' });
  };

  const validate = () => {
    let valid = true;
    const newErrors = { username: '', email: '' };
    if (!formData.username.trim()) {
      newErrors.username = 'Username is required';
      valid = false;
    }
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
      valid = false;
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
      valid = false;
    }
    setErrors(newErrors);
    return valid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const response = await forgotPassword(formData);
      toast.success(response?.data?.message || 'Password sent successfully!');
      setTimeout(() => navigate('/auth/signin'), 1500);
    } catch (error: any) {
      const msg = error?.response?.data?.message || 'Something went wrong';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        bgcolor: '#f1f5f9',
        p: 2,
      }}
    >
      <Paper
        elevation={3}
        sx={{
          p: { xs: 3, sm: 5 },
          borderRadius: 3,
          width: '100%',
          maxWidth: 500,
        }}
      >
        <Typography variant="h4" gutterBottom fontWeight="bold">
          Forgot Password
        </Typography>
        <Typography color="textSecondary" sx={{ mb: 3 }}>
          Enter your username and registered email to reset your password.
        </Typography>

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <InputLabel sx={{ fontWeight: 500, mb: 0.5 }}>Username</InputLabel>
          <TextField
            fullWidth
            required
            name="username"
            placeholder="Enter your username"
            value={formData.username}
            onChange={handleChange}
            error={!!errors.username}
            helperText={errors.username}
            sx={{ mb: 2 }}
          />

          <InputLabel sx={{ fontWeight: 500, mb: 0.5 }}>Email</InputLabel>
          <TextField
            fullWidth
            required
            name="email"
            type="email"
            placeholder="Enter your email"
            value={formData.email}
            onChange={handleChange}
            error={!!errors.email}
            helperText={errors.email}
            sx={{ mb: 3 }}
          />

          <Button
            fullWidth
            type="submit"
            variant="contained"
            color="primary"
            disabled={loading}
            sx={{ py: 1.5, fontWeight: 600 }}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Submit'}
          </Button>
        </Box>

        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
          <Typography variant="body2">Remembered your password?</Typography>
          <Typography
            component={Link}
            to="/auth/signin"
            sx={{
              ml: 1,
              textDecoration: 'none',
              color: 'primary.main',
              fontWeight: 600,
            }}
          >
            Sign In
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
};

export default ForgotPassword;