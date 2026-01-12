import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Autocomplete, TextField as MuiTextField } from '@mui/material';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { CreateUser, EditUser, GetRoles, GetUser } from '../../common/Apis';
import TopLoader from '../../common/Loader/TopLoader';
import CustomCard from '../../CustomComponents/CustomCard';
import CustomButton from '../../CustomComponents/CustomButton';

export default function NewUser() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [actionsLoading, setActionsLoading] = useState(false);
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const {
    control,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      username: '',
      email: '',
      status: '',
      roles: [],
      password: '',
      confirmPassword: '',
    },
  });
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const { data } = await GetRoles();
        setRoles(data.roles);
      } catch (error) {
        console.error(error);
      }
    };
    fetchRoles();
  }, []);

  const onSubmit = async (data) => {
    try {
      const response = id ? await EditUser(id, data) : await CreateUser(data);
      toast.success(response?.data?.message);
      navigate('/users/list');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error occurred');
    }
  };

  useEffect(() => {
    const GetUserDetails = async () => {
      setActionsLoading(true);
      try {
        const response = await GetUser(id);
        reset(response?.data?.data);
      } catch (error) {
        console.log(error?.response?.data?.message || error?.message);
        navigate('/users/list');
      } finally {
        setActionsLoading(false);
      }
    };
    if (id) {
      GetUserDetails();
    }
  }, [id]);

  return (
    <>
      {isSubmitting && <TopLoader />}
      <CustomCard className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-4">User Details</h2>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Username
              </label>
              <Controller
                name="username"
                control={control}
                rules={{
                  required: 'Username is required',
                }}
                render={({ field }) => (
                  <input
                    {...field}
                    className="w-full p-2 border rounded"
                  />
                )}
              />
              {errors.username && (
                <p className="text-red-500 text-sm">
                  {errors.username.message}
                </p>
              )}
            </div>
            
            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <Controller
                name="email"
                control={control}
                rules={{
                  required: 'Email is required',
                  pattern: {
                    value: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
                    message: 'Invalid email address',
                  },
                }}
                render={({ field }) => (
                  <input
                    {...field}
                    type="email"
                    className="w-full p-2 border rounded"
                    placeholder="Enter email address"
                  />
                )}
              />
              {errors.email && (
                <p className="text-red-500 text-sm">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <Controller
                name="password"
                control={control}
                rules={{
                  required: !id && 'Password is required', // Only required for create
                  minLength: {
                    value: 6,
                    message: 'Password must be at least 6 characters',
                  },
                }}
                render={({ field }) => (
                  <input
                    {...field}
                    type="password"
                    className="w-full p-2 border rounded"
                    placeholder="Enter password"
                  />
                )}
              />
              {errors.password && (
                <p className="text-red-500 text-sm">
                  {errors.password.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Confirm Password
              </label>
              <Controller
                name="confirmPassword"
                control={control}
                rules={{
                  validate: (value) => {
                    if (value !== watch('password')) {
                      return 'Passwords do not match';
                    }
                    return true;
                  },
                }}
                render={({ field }) => (
                  <input
                    {...field}
                    type="password"
                    className="w-full p-2 border rounded"
                    placeholder="Confirm password"
                  />
                )}
              />
              {errors.confirmPassword && (
                <p className="text-red-500 text-sm">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Status
              </label>
              <Controller
                name="status"
                control={control}
                rules={{ required: 'Status is required' }}
                render={({ field }) => (
                  <select
                    {...field}
                    className="w-full p-2 border rounded"
                  >
                    <option value="">Select Status</option>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                )}
              />
              {errors.status && (
                <p className="text-red-500 text-sm">{errors.status.message}</p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Roles
              </label>
              <Controller
                name="roles"
                control={control}
                rules={{ required: 'At least one role is required' }}
                render={({ field }) => {
                  const allSelected = field.value?.length === roles?.length;

                  const enhancedOptions = [
                    {
                      id: 'all',
                      role: allSelected ? 'Deselect All' : 'Select All',
                      departmentName: '',
                    },
                    ...(roles || []),
                  ];

                  return (
                    <Autocomplete
                      multiple
                      className="mb-3"
                      size="small"
                      options={enhancedOptions}
                      getOptionLabel={(option) =>
                        option.id === 'all'
                          ? option.role
                          : `${option.role} (department - ${option.departmentName})`
                      }
                      value={
                        allSelected
                          ? roles
                          : roles?.filter((r) => field?.value?.includes(r.id))
                      }
                      onChange={(_, value) => {
                        if (value.some((v) => v.id === 'all')) {
                          field.onChange(
                            allSelected ? [] : roles?.map((r) => r.id),
                          );
                        } else {
                          field.onChange(value.map((v) => v.id));
                        }
                      }}
                      renderInput={(params) => (
                        <MuiTextField
                          error={!!errors?.roles}
                          helperText={errors?.roles?.message}
                          {...params}
                          variant="outlined"
                        />
                      )}
                    />
                  );
                }}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <CustomButton
                type="submit"
                disabled={isSubmitting || actionsLoading}
                text={id ? 'Update' : 'Save'}
                className={'w-full'}
              ></CustomButton>
              <Link to="/users/list">
                <CustomButton
                  disabled={isSubmitting || actionsLoading}
                  text={'Cancel'}
                  className={'w-full'}
                  variant={'danger'}
                ></CustomButton>
              </Link>
            </div>
          </div>
        </form>
      </CustomCard>
    </>
  );
}