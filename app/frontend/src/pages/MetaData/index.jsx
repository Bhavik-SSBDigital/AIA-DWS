import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import React, { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import styles from './MetaData.module.css';
import Grid2 from '@mui/material/Grid2';
import axios from 'axios';
import { toast } from 'react-toastify';
import { upload } from '../../components/drop-file-input/FileUploadDownload';

export default function MetaData() {
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  // tabs
  const [selectedTab, setSelectedTab] = useState('form');

  // file uppload tab
  const [file, setFile] = useState(null);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    setFile(selectedFile);
  };

  const handleUpload = async () => {
    const url = backendUrl + '/storeDocMetaDataExcel';

    if (!file) {
      toast.warn('Please select a file first.');
      return;
    }

    try {
      // Create FormData object
      const formData = new FormData();
      // formData.append('file', file); // Append the selected file
      formData.append('sourceFilePath', '../meta'); // Update with the actual source path
      formData.append('sourceFileName', file);

      // Send the request
      const response = await axios.post(url, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.status === 200) {
        toast.success(`File "${file.name}" uploaded successfully!`);
        setFile(null); // Reset the file input
      } else {
        toast.error('Failed to upload file.');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('An error occurred during upload.');
    }
  };

  // ---------------------------------
  // meta data form
  const {
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      departmentName: '',
      path: '',
      folderName: '',
      workName: '',
      cabinetNo: '',
      name: '',
      year: '',
      file: null,
    },
  });
  const token = sessionStorage.getItem('accessToken');
  const [path] = watch(['path']);
  const [departments, setDepartments] = useState([]);
  const [pathList, setPathList] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState();

  const create = async (path, foldername) => {
    // console.log(path, foldername);
    try {
      let createPath = `${path}/${foldername}`;
      const response = await axios.post(
        backendUrl + '/createFolder',
        {
          path: createPath,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      return createPath;
    } catch (error) {
      console.error(error?.response?.data?.message || error?.message);
    }
  };
  const [headOfficeName, setHeadOfficeName] = useState(false);
  const getHeadOfficeName = async () => {
    const url = backendUrl + '/getHeadOfficeName';
    try {
      const response = await axios.get(url);
      setHeadOfficeName(response?.data?.branchName);
    } catch (error) {
      // console.log(error?.response?.data?.message || error?.message);
    }
  };
  useEffect(() => {
    getHeadOfficeName();
  }, []);
  const onSubmit = async (formData) => {
    try {
      const dummy = () => {};
      const getDocNameUrl = backendUrl + '/getProcessDocumentName';

      let department;
      if (selectedDepartment.branch === headOfficeName) {
        const [, outputString] = formData.departmentName.split(
          `${headOfficeName}_`,
        );
        department = outputString;
      } else {
        department = formData.departmentName;
      }

      let path = `../${department}`;
      if (formData.path && formData.folderName) {
        path = await create(formData?.path, formData?.folderName);
      } else if (formData.path) {
        path = formData.path;
      } else {
        path = `../${department}`;
      }
      let res = await axios.post(
        getDocNameUrl,
        {
          department: formData.departmentName,
          workName: formData.workName,
          cabinetNo: formData.cabinetNo,
          fileName: formData.name,
          year: formData.year,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      let ext = formData?.file?.name.split('.').pop();
      formData.file
        ? await upload(
            [formData.file],
            `${path}`,
            dummy,
            `${res.data.name}.${ext}`,
            true,
            formData?.cabinetNo,
            formData?.workName,
            formData?.year,
            formData?.departmentName,
          )
        : await axios.post(
            `${backendUrl}/storeDocMetaData`,
            {
              cabinetNo: formData.cabinetNo,
              workName: formData.workName,
              year: formData.year,
              departmentName: formData.departmentName,
              name: res.data.name,
              path: path,
            },
            { headers: { Authorization: `Bearer ${token}` } },
          );
      toast.success('Meta data uploaded');
      reset();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
      // console.log(error?.message);
    }
  };

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 20 }, (_, i) => currentYear - i);
  useEffect(() => {
    const getDepartments = async () => {
      const url = backendUrl + '/getDepartments';
      try {
        const response = await axios.post(url, null, {
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem('accessToken')}`,
          },
        });
        if (response.status === 200) {
          setDepartments(response.data.departments);
        }
      } catch (error) {
        setError(error);
        // alert("Unable to fetch departments..");
      }
    };
    getDepartments();
  }, []);

  useEffect(() => {
    if (selectedDepartment) {
      const getPath = async () => {
        try {
          let department;
          if (selectedDepartment?.branch === headOfficeName) {
            const [, outputString] = selectedDepartment?.department.split(
              `${headOfficeName}_`,
            );
            department = outputString;
          } else {
            department = selectedDepartment?.branch;
          }
          const getPathUrl = backendUrl + '/getDocumentChildren';
          const res = await axios.post(
            getPathUrl,
            {
              path: `../${department}`,
            },
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          );
          setPathList(res.data.children);
        } catch (error) {
          // console.log(error?.response?.data?.message || error?.message);
        }
      };
      getPath();
    }
  }, [selectedDepartment]);

  //   -------------------
  return (
    <div className={styles.container}>
      <Stack
        gap={1}
        sx={{
          bgcolor: '#EEEEEE',
          width: 'fit-content',
          p: 0.6,
          borderRadius: '8px',
        }}
        mb={2}
        flexDirection={'row'}
      >
        <div
          onClick={() => setSelectedTab('form')}
          className={`${styles.tab} ${
            selectedTab == 'form' && styles.selectedTab
          }`}
        >
          <Typography variant="body1" color="initial" textAlign={'center'}>
            Form
          </Typography>
        </div>
        <div
          onClick={() => setSelectedTab('upload')}
          className={`${styles.tab} ${
            selectedTab == 'upload' && styles.selectedTab
          }`}
        >
          <Typography variant="body1" color="initial" textAlign={'center'}>
            Upload File
          </Typography>
        </div>
      </Stack>
      {selectedTab == 'form' ? (
        <form onSubmit={handleSubmit(onSubmit)}>
          <Typography
            textAlign="center"
            sx={{ fontWeight: 600, fontSize: 26 }}
            gutterBottom
          >
            Meta Data Upload
          </Typography>
          <Grid2 container spacing={2}>
            {/* Department Name */}
            <Grid2 size={{ xs: 12, md: 6 }}>
              <FormControl
                fullWidth
                margin="normal"
                error={!!errors.departmentName}
              >
                <InputLabel>Department Name</InputLabel>
                <Controller
                  name="departmentName"
                  control={control}
                  rules={{ required: 'Department Name is required' }}
                  render={({ field }) => (
                    <Select
                      {...field}
                      value={
                        departments.find(
                          (dept) => dept.department === field.value,
                        ) || ''
                      }
                      onChange={(e) => {
                        const selectedObject = e.target.value; // Full object
                        setSelectedDepartment(selectedObject); // Save the full object in local state
                        field.onChange(selectedObject.department); // Save only the key in the form state
                      }}
                      label="Department Name"
                    >
                      {departments.map((department) => (
                        <MenuItem
                          key={department.department}
                          value={department}
                        >
                          {department.department}
                        </MenuItem>
                      ))}
                    </Select>
                  )}
                />
              </FormControl>
            </Grid2>

            {/* File Path */}
            <Grid2 size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth margin="normal">
                <InputLabel>File Path</InputLabel>
                <Controller
                  name="path"
                  control={control}
                  render={({ field }) => (
                    <Select
                      {...field}
                      label="File Path"
                      disabled={!selectedDepartment}
                    >
                      {pathList?.map((option) => (
                        <MenuItem key={option} value={option}>
                          {option}
                        </MenuItem>
                      ))}
                    </Select>
                  )}
                />
              </FormControl>
            </Grid2>
            {/* Folder Name */}
            <Grid2 size={{ xs: 12, md: 6 }}>
              <Controller
                name="folderName"
                control={control}
                disabled={!path}
                render={({ field }) => (
                  <TextField
                    fullWidth
                    margin="normal"
                    label="Folder Name"
                    {...field}
                  />
                )}
              />
            </Grid2>

            {/* Work Name */}
            <Grid2 size={{ xs: 12, md: 6 }}>
              <Controller
                name="workName"
                control={control}
                render={({ field }) => (
                  <TextField
                    fullWidth
                    margin="normal"
                    label="Work Name"
                    {...field}
                  />
                )}
              />
            </Grid2>
            {/* Cabinet No */}
            <Grid2 size={{ xs: 12, md: 6 }}>
              <Controller
                name="cabinetNo"
                control={control}
                rules={{
                  required: 'Cabinet No is required',
                  min: {
                    value: 0,
                    message: 'Cabinet No cannot be negative',
                  },
                }}
                render={({ field }) => (
                  <TextField
                    fullWidth
                    margin="normal"
                    type="number"
                    label="Cabinet No"
                    error={!!errors.cabinetNo}
                    helperText={errors.cabinetNo?.message}
                    inputProps={{
                      min: 0, // Restrict input to non-negative values
                    }}
                    {...field}
                  />
                )}
              />
            </Grid2>
            {/* File Name */}
            <Grid2 size={{ xs: 12, md: 6 }}>
              <Controller
                name="name"
                control={control}
                rules={{ required: 'File Name is required' }}
                render={({ field }) => (
                  <TextField
                    fullWidth
                    margin="normal"
                    label="File Name"
                    error={!!errors.name}
                    helperText={errors.name?.message}
                    {...field}
                  />
                )}
              />
            </Grid2>
            {/* Year */}
            <Grid2 size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth margin="normal" error={!!errors.year}>
                <InputLabel>Year</InputLabel>
                <Controller
                  name="year"
                  control={control}
                  rules={{ required: 'Year is required' }}
                  render={({ field }) => (
                    <Select {...field} label="Year">
                      {yearOptions.map((year) => (
                        <MenuItem key={year} value={year}>
                          {year}
                        </MenuItem>
                      ))}
                    </Select>
                  )}
                />
              </FormControl>
            </Grid2>
            {/* File Upload */}
            <Grid2 size={{ xs: 12, md: 6 }}>
              <Controller
                name="file"
                control={control}
                render={({ field }) => (
                  <TextField
                    type="file"
                    margin="normal"
                    fullWidth
                    inputRef={field.ref} // Attach the ref from React Hook Form
                    InputLabelProps={{ shrink: true }}
                    inputProps={{
                      accept: '.pdf,.doc,.jpg', // Optional: Restrict file types
                    }}
                    onChange={(e) => {
                      const file = e.target.files[0]; // Extract the file
                      field.onChange(file); // Pass the file to React Hook Form
                    }}
                  />
                )}
              />
            </Grid2>
            <Grid2 size={{ xs: 12 }}>
              <Button
                disabled={isSubmitting}
                type="submit"
                sx={{ width: '220px', display: 'block', mx: 'auto' }}
                variant="contained"
                color="primary"
              >
                {isSubmitting ? <CircularProgress size={22} /> : 'Submit'}
              </Button>
            </Grid2>
          </Grid2>
        </form>
      ) : (
        <div className={styles.uploadContainer}>
          <h1 className={styles.heading}>Upload File Here</h1>
          <Box className={styles.uploadBox}>
            {file ? (
              <div className={styles.fileInfo}>
                <p>Selected File: {file.name}</p>
                <button
                  className={styles.removeBtn}
                  onClick={() => setFile(null)}
                >
                  Remove
                </button>
              </div>
            ) : (
              <label className={styles.uploadLabel}>
                <input
                  type="file"
                  onChange={handleFileChange}
                  className={styles.fileInput}
                />
                Drag & Drop or Click to Upload
              </label>
            )}
          </Box>
          <button className={styles.uploadBtn} onClick={handleUpload}>
            Upload
          </button>
        </div>
      )}
    </div>
  );
}
