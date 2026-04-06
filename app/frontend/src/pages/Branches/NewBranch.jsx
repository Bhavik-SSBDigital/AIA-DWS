import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  CircularProgress,
  FormControl,
  Grid2,
  MenuItem,
  TextField,
  Divider,
  Typography,
  Stack,
} from '@mui/material';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import Workflow from '../../common/Workflow';
import { getAllBranches } from '../../common/Apis';

const NewBranch = () => {
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const accessToken = sessionStorage.getItem('accessToken');
  const { id } = useParams();
  const navigate = useNavigate();
  const [editObject, setEditObject] = useState({});
  const [loading, setLoading] = useState(false);
  const [finalBranch, setFinalBranch] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    code: 0,
    department: null,
    parentDepartment: null,
    type: 'branch',
    status: 'Active',
    head: null,
    workFlow: [],
  });

  const [userList, setUserList] = useState([]);
  const [branches, setBranches] = useState([]);
  const [flow, setFlow] = useState({ step: '' });
  const [usersOnStep, setUsersOnStep] = useState([]);

  // fetch all branches
  const getBranches = async () => {
    try {
      const response = await getAllBranches();
      setBranches(response?.data?.departments);
    } catch (error) {
      console.error('unable to fetch branches');
    }
  };

  // fetch parent departments
  const [departments, setDepartments] = useState([]);
  const getDepartments = async () => {
    const url = backendUrl + '/getDepartmentNames';
    try {
      const res = await axios({
        url: url,
        method: 'get',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setDepartments(res?.data?.names);
    } catch (error) {
      // console.log(error);
    }
  };

  // Fetch User List
  const fetchData = async () => {
    const url = `${backendUrl}/getUsernames`;
    const { data } = await axios.get(url);
    setUserList(data.users);
  };

  // Fetch Edit Details if ID exists
  const getEditDetails = async () => {
    setLoading(true);
    try {
      const url = `${backendUrl}/getBranch/${id}`;
      const res = await axios.post(url, null, {
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem('accessToken')}`,
        },
      });
      if (res.status === 200) {
        setEditObject(res?.data?.department);
        setFormData(res?.data?.department); // Populate form fields
      }
    } catch (error) {
      console.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    getDepartments();
    getBranches();
    if (id) getEditDetails();
  }, []);

  // Handle Input Change
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url =
        backendUrl +
        (Object.keys(editObject).length > 0
          ? `/editBranch/${editObject._id}`
          : '/createBranch');

      const response = await axios.post(url, formData, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.status === 200) {
        toast.success(
          Object.keys(editObject).length > 0
            ? 'Branch is edited'
            : 'Branch is created',
        );
        setEditObject({});
        setLoading(false);
        navigate('/branches/list');
        setFormData({
          code: 0,
          name: '',
          parentDepartment: '',
          type: 'branch',
          status: 'Active',
          isHeadOffice: false,
          head: '',
          workFlow: [],
        });
      } else {
        setLoading(false);
        toast.error('Error');
      }
    } catch (error) {
      setLoading(false);
      toast.error(error?.response?.data?.message);
    }
  };

  // handleWorkflow
  const handleWorkFlow = () => {
    if (formData.workFlow.length === 0) {
      setFinalBranch(formData.branch); // Set final branch if no workflow exists
    }

    // Ensure `usersOnStep` is not empty
    if (usersOnStep.length > 0) {
      setFormData((prev) => {
        const updatedWorkFlow = [...(prev.workFlow || [])]; // Ensure workFlow is always an array

        if (!flow.step || flow.step > updatedWorkFlow.length) {
          // If step is not defined or greater than the length, append to the end
          updatedWorkFlow.push({
            ...flow,
            users: usersOnStep,
            step: updatedWorkFlow.length + 1,
          });
        } else {
          // Insert at the specified step
          updatedWorkFlow.splice(flow.step - 1, 0, {
            ...flow,
            users: usersOnStep,
          });

          // Update step numbers for all items after the insertion point
          for (let i = flow.step; i < updatedWorkFlow.length; i++) {
            updatedWorkFlow[i].step = i + 1;
          }
        }

        return {
          ...prev,
          workFlow: updatedWorkFlow,
        };
      });

      // Reset temporary states after adding workflow
      setFlow({ step: '' });
      setUsersOnStep([]);
    } else {
      toast.info('Please provide all inputs!');
    }
  };

  return (
    <div
      style={{
        width: '100%',
        maxHeight: 'fit-content',
        backgroundColor: 'white',
        padding: '20px',
        border: '1px solid lightgray',
        borderRadius: '10px',
        boxShadow: 'rgba(149, 157, 165, 0.2) 0px 8px 24px',
      }}
    >
      <form onSubmit={handleSubmit}>
        <Grid2 container spacing={5} justifyContent="center" sx={{ mt: 2 }}>
          {/* Branch Code */}
          <Grid2 size={{ xs: 12, sm: 6 }}>
            <TextField
              name="code"
              value={formData.code}
              onChange={handleInputChange}
              label="Branch Code"
              type="number"
              fullWidth
              inputProps={{ min: '0' }}
              sx={{ backgroundColor: 'whitesmoke' }}
            />
          </Grid2>

          {/* Branch Name */}
          <Grid2 size={{ xs: 12, sm: 6 }}>
            <TextField
              name="department"
              value={formData.department}
              onChange={handleInputChange}
              label="Branch Name"
              fullWidth
              sx={{ backgroundColor: 'whitesmoke' }}
            />
          </Grid2>

          {/* Parent Department */}
          <Grid2 size={{ xs: 12, sm: 6 }}>
            <TextField
              name="parentDepartment"
              value={formData.parentDepartment}
              onChange={handleInputChange}
              select
              fullWidth
              label="Parent Department"
              sx={{ backgroundColor: 'whitesmoke' }}
            >
              {departments?.map((department) => (
                <MenuItem key={department?.name} value={department?.name}>
                  {department?.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid2>

          {/* head */}
          <Grid2 size={{ xs: 12, sm: 6 }}>
            <TextField
              name="head"
              value={formData.head}
              onChange={handleInputChange}
              select
              fullWidth
              label="Branch Head"
              sx={{ backgroundColor: 'whitesmoke' }}
            >
              {userList?.map((user, index) => (
                <MenuItem value={user.username} key={index}>
                  {user.username}
                </MenuItem>
              ))}
            </TextField>
          </Grid2>

          {/* Status */}
          <Grid2 size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth>
              <TextField
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                select
                label="Status"
                displayEmpty
                sx={{ backgroundColor: 'whitesmoke' }}
              >
                <MenuItem value="Active">Active</MenuItem>
                <MenuItem value="Deactive">Deactive</MenuItem>
              </TextField>
            </FormControl>
          </Grid2>
        </Grid2>
        <Divider sx={{ my: 5 }} />
        <Typography
          variant="h6"
          sx={{ textAlign: 'center', mb: 4 }}
          gutterBottom
        >
          Work Flow :
        </Typography>
        <Workflow
          workFlow={formData.workFlow}
          workFlowLength={formData.workFlow.length}
          handleWorkFlow={handleWorkFlow}
          setWorkFLow={setFormData}
          flow={flow}
          setFlow={setFlow}
          usersOnStep={usersOnStep}
          setUsersOnStep={setUsersOnStep}
          fullState={formData}
        />
        {/* Buttons */}
        <Grid2 xs={12} display="flex" justifyContent="center" gap={2}>
          <Button
            type="submit"
            variant="contained"
            color="success"
            sx={{ width: '150px' }}
            disabled={loading}
          >
            {loading ? (
              <CircularProgress size={26} />
            ) : Object.keys(editObject).length > 0 ? (
              'Update'
            ) : (
              'Save'
            )}
          </Button>
          <Link to="/branches/list">
            <Button
              variant="contained"
              sx={{ width: '150px' }}
              color="error"
              disabled={loading}
            >
              Cancel
            </Button>
          </Link>
        </Grid2>
      </form>
    </div>
  );
};

export default NewBranch;
