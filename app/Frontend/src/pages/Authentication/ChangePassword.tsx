import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  InputLabel,
  Stack,
  CircularProgress,
  IconButton,
} from '@mui/material';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { toast } from 'react-toastify';
import { changePassword } from '../../common/Apis'; 
import CryptoJS from 'crypto-js';

const ChangePassword: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [formData, setFormData] = useState({
    username: sessionStorage.getItem('username') || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: '' });
  };

  const toggleShow = (field: keyof typeof showPasswords) => {
    setShowPasswords({ ...showPasswords, [field]: !showPasswords[field] });
  };

  const validate = () => {
    let valid = true;
    const newErrors = { currentPassword: '', newPassword: '', confirmPassword: '' };

    if (!formData.currentPassword) {
      newErrors.currentPassword = 'Current password is required';
      valid = false;
    }
    if (!formData.newPassword) {
      newErrors.newPassword = 'New password is required';
      valid = false;
    } else if (formData.newPassword.length < 6) {
      newErrors.newPassword = 'Password must be at least 6 characters';
      valid = false;
    }
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm new password';
      valid = false;
    } else if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
      valid = false;
    }
    if (formData.currentPassword === formData.newPassword) {
      newErrors.newPassword = 'New password must be different from current';
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
      // VAPT FIX: Encrypt passwords using AES before network transmission
      const securePayload = {
        username: formData.username,
        currentPassword: CryptoJS.AES.encrypt(formData.currentPassword, import.meta.env.VITE_ENCRYPTION_KEY).toString(),
        newPassword: CryptoJS.AES.encrypt(formData.newPassword, import.meta.env.VITE_ENCRYPTION_KEY).toString(),
      };
      
      const response = await changePassword(securePayload);
      toast.success(response?.data?.message || 'Password changed successfully');
      // Optionally logout or stay logged in
      setTimeout(() => navigate('/profile'), 1500);
    } catch (error: any) {
      // VAPT FIX #18: Removed console.log("error changing password", error)
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
          Change Password
        </Typography>
        <Typography color="textSecondary" sx={{ mb: 3 }}>
          Enter your current password and choose a new one.
        </Typography>

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <InputLabel sx={{ fontWeight: 500, mb: 0.5 }}>Current Password</InputLabel>
          <TextField
            fullWidth
            required
            name="currentPassword"
            type={showPasswords.current ? 'text' : 'password'}
            autoComplete="current-password" // VAPT FIX #18
            placeholder="Enter current password"
            value={formData.currentPassword}
            onChange={handleChange}
            error={!!errors.currentPassword}
            helperText={errors.currentPassword}
            sx={{ mb: 2 }}
            InputProps={{
              endAdornment: (
                <IconButton onClick={() => toggleShow('current')} edge="end">
                  {showPasswords.current ? <IconEyeOff /> : <IconEye />}
                </IconButton>
              ),
            }}
          />

          <InputLabel sx={{ fontWeight: 500, mb: 0.5 }}>New Password</InputLabel>
          <TextField
            fullWidth
            required
            name="newPassword"
            type={showPasswords.new ? 'text' : 'password'}
            autoComplete="new-password" // VAPT FIX #18
            placeholder="Enter new password"
            value={formData.newPassword}
            onChange={handleChange}
            error={!!errors.newPassword}
            helperText={errors.newPassword}
            sx={{ mb: 2 }}
            InputProps={{
              endAdornment: (
                <IconButton onClick={() => toggleShow('new')} edge="end">
                  {showPasswords.new ? <IconEyeOff /> : <IconEye />}
                </IconButton>
              ),
            }}
          />

          <InputLabel sx={{ fontWeight: 500, mb: 0.5 }}>Confirm New Password</InputLabel>
          <TextField
            fullWidth
            required
            name="confirmPassword"
            type={showPasswords.confirm ? 'text' : 'password'}
            autoComplete="new-password" // VAPT FIX #18
            placeholder="Confirm new password"
            value={formData.confirmPassword}
            onChange={handleChange}
            error={!!errors.confirmPassword}
            helperText={errors.confirmPassword}
            sx={{ mb: 3 }}
            InputProps={{
              endAdornment: (
                <IconButton onClick={() => toggleShow('confirm')} edge="end">
                  {showPasswords.confirm ? <IconEyeOff /> : <IconEye />}
                </IconButton>
              ),
            }}
          />

          <Button
            fullWidth
            type="submit"
            variant="contained"
            color="primary"
            disabled={loading}
            sx={{ py: 1.5, fontWeight: 600 }}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Change Password'}
          </Button>
        </Box>

        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
          <Typography
            component="span"
            onClick={() => navigate(-1)}
            sx={{
              cursor: 'pointer',
              color: 'primary.main',
              fontWeight: 600,
            }}
          >
            Go Back
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
};

export default ChangePassword;