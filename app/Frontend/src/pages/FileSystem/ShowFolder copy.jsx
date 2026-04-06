import {
  Box,
  Button,
  Stack,
  TextField,
  Modal,
  CircularProgress,
  Paper,
  IconButton,
  Menu,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  FormControlLabel,
  RadioGroup,
  Radio,
  Typography,
  Tooltip,
  Tabs,
  Tab,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
} from '@mui/material';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DropFileInput from '../../components/drop-file-input/DropFileInput';
import { ImageConfig } from '../../config/ImageConfig';
import axios from 'axios';

import { useSelector, useDispatch } from 'react-redux';
import {
  backButtonPath,
  copy,
  cut,
  onReload,
  setPath,
} from '../../Slices/PathSlice';

import imageSrc from '../../assets/images/folder.png';

import {
  download,
  upload,
} from '../../components/drop-file-input/FileUploadDownload';
import styles from './ShowFolder.module.css';
import moment from 'moment';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import AddIcon from '@mui/icons-material/Add';
import Fab from '@mui/material/Fab';
import Path from '../../components/path/PathBar';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import HandymanIcon from '@mui/icons-material/Handyman';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import View from '../view/View';
import {
  IconDownload,
  IconEye,
  IconClipboard,
  IconScissors,
  IconTrash,
  IconTool,
  IconTransfer,
  IconCircleCheck,
  IconChevronLeftPipe,
  IconChevronsLeft,
} from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router-dom';
import { IconFolderPlus } from '@tabler/icons-react';
import { toast } from 'react-toastify';
import { IconUpload } from '@tabler/icons-react';
import ComponentLoader from '../../common/Loader/ComponentLoader';
import { Controller, useForm } from 'react-hook-form';

export default function ShowFolder(props) {
  const token = sessionStorage.getItem('accessToken');
  const isKeeperOfPhysicalDocs =
    sessionStorage.getItem('isKeeperOfPhysicalDocs') == 'true';
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const url = backendUrl + '/accessFolder';
  const dispatch = useDispatch();
  const pathValue = useSelector((state) => state.path.value);
  const [loading, setLoading] = useState(true);
  const [fileFolders, setFileFolders] = useState([]);
  const [open, setOpen] = useState(false);
  const [modalContentFor, setModalContentFor] = useState(null);
  const [folderName, setFolderName] = useState('');
  const [showButtons, setShowButtons] = useState(false);
  const [error, setError] = useState('');
  const [isUploadable, setIsUploadable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [fileView, setFileView] = useState();
  const [anchorEl, setAnchorEl] = useState(null);
  const [anchorEl1, setAnchorEl1] = useState(null);
  const [itemName, setItemName] = useState('');
  const [properties, setProperties] = useState();
  const [showProperties, setShowProterties] = useState(false);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const fileName = useSelector((state) => state.path.fileName);
  const sourcePath = useSelector((state) => state.path.sourcePath);
  const method = useSelector((state) => state.path.method);
  const [isModalOpen, setModalOpen] = useState(false);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [transferData, setTransferData] = useState({
    userBranch: '',
    documentId: '',
    purpose: '',
    role: '',
    borrower: '',
  });
  const [branches, setBranches] = useState([]);
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState();
  const [userBranch, setUserBranch] = useState('');
  const [isTransfer, setTransfer] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const [selectedTab, setSelectedTab] = useState(0);
  const [openTooltip, setOpenToolTip] = useState(false);

  const getData = async () => {
    try {
      const { data } = await axios.post(
        url,
        {
          path: `${pathValue}`,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            // 'Content-Type': 'multipart/form-data'
          },
        },
      );
      // console.log(data);
      if (data) {
        setLoading(false);
        setError('');
      }
      setFileFolders([...data.children]);
      setIsUploadable(data.isUploadable);
    } catch (error) {
      setLoading(false);
      setError(error?.response?.data?.message);
    }
  };
  useEffect(() => {
    if (loaded && pathValue !== '..') {
      getData();
    }
  }, [loaded, pathValue]);
  const onFileChange = (files) => {
    // console.log(files);
  };
  const createFolder = async () => {
    setOpen(false);
    setLoading(true);

    const response = await axios.post(
      backendUrl + '/createFolder',
      {
        path: `${pathValue}/${folderName}`,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
    if (response.status === 200) {
      const currentDate = new Date();
      const currentDateTimeString = currentDate.toString();
      setFileFolders((prev) => [
        ...prev,
        {
          createdBy: token,
          createdOn: currentDateTimeString,
          name: folderName,
          type: 'folder',
        },
      ]);
    }
    setLoading(false);
    setFolderName('');
  };
  const openModal = (action) => {
    setModalContentFor(action);
    setOpen(true);
  };
  const handleFolderClick = (name) => {
    setLoading(true);
    setShowProterties(false);
    dispatch(setPath(name));
    const localPath = sessionStorage.getItem('path');
    sessionStorage.setItem('path', `${localPath}/${name}`);
  };
  const closeModal = () => {
    setOpen(false);
  };
  const navigate = useNavigate();
  const handleBackPress = () => {
    setLoading(true);
    var pathParts = pathValue.split('/');
    pathParts.pop();
    var newPath = pathParts.join('/');
    sessionStorage.setItem('path', newPath);
    dispatch(backButtonPath(newPath));
    if (newPath === '..') {
      navigate('/files');
    }
  };

  // file handling functions
  const handleDownload = (path, name) => {
    try {
      download(name, path);
    } catch (error) {
      console.error('Error downloading file:', error);
      // alert('An error occurred while downloading the file.');
    }
    handleClose();
  };
  const handleViewClose = () => {
    setFileView(null);
  };
  const handleView = async (path, name, id) => {
    // console.log(id);
    setLoading(true);
    try {
      const fileData = await download(name, path, true);
      setLoading(false);
      if (fileData) {
        setFileView({
          url: fileData.data,
          type: fileData.fileType,
          fileId: id,
        });
      } else {
        console.error('Invalid fileData:', fileData);
        toast.error('Invalid file data.');
      }
    } catch (error) {
      console.error('Error viewing file:', error);
      toast.error('Unable to view the file.');
    } finally {
      setLoading(false);
    }
  };
  const handleDownloadFolder = async (path, name) => {
    const urlDownload = `${backendUrl}/downloadFolder`;

    try {
      const response = await axios.post(
        urlDownload,
        {
          folderPath: path,
          folderName: name,
        },
        {
          responseType: 'arraybuffer',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const contentType = response.headers['content-type'];

      if (contentType === 'application/zip') {
        const blob = new Blob([response.data], { type: contentType });
        const blobUrl = URL.createObjectURL(blob);

        const anchor = document.createElement('a');
        anchor.href = blobUrl;
        anchor.download = `${name}.zip`;

        document.body.appendChild(anchor);
        anchor.click();
        URL.revokeObjectURL(blobUrl);
        document.body.removeChild(anchor);
      } else {
        console.error('Unsupported content type:', contentType);
        toast.error('Unsupported content type');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('An error occurred while downloading the folder.');
    }
    handleClose();
  };
  const handlePlus = () => {
    setShowButtons(!showButtons);
  };
  const closePlus = () => {
    setShowButtons(false);
  };
  const handleClick = (event, name, item) => {
    setShowProterties(false);
    setItemName(name);
    setAnchorEl(event.currentTarget);
    setProperties(item);
  };
  const handleClick1 = (event, name, item) => {
    setShowProterties(false);
    setItemName(name);
    setAnchorEl1(event.currentTarget);
    setProperties(item);
  };
  const handleClose = () => {
    setAnchorEl(null);
    setAnchorEl1(null);
  };
  const handleContextMenu = (event, item) => {
    event.preventDefault();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    setContextMenuPos({ x: event.clientX, y: event.clientY });
    setIsContextMenuOpen(true);
  };
  const handleCopy = (name) => {
    toast.success('File copied');
    dispatch(copy({ name, pathValue, method: 'copy' }));
    handleClose();
  };
  const handleCut = (name) => {
    toast.success('File cut successfully');
    dispatch(cut({ name, pathValue, method: 'cut' }));
    handleClose();
  };
  const deleteModalOpen = () => {
    handleClose();
    setModalOpen(true);
  };
  const deleteModalClose = () => {
    setModalOpen(false);
  };
  const handleDelete = async (name) => {
    setLoading(true);
    try {
      const res = await axios.post(
        `${backendUrl}/deleteFile`,
        {
          path: `${pathValue}/${name}`,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (res.status === 200) {
        const update = fileFolders.filter((item) => item.name !== name);
        setFileFolders(update);
        setLoading(false);
        toast.success('File deleted');
      } else {
        // Handle unexpected response status codes
        setLoading(false);
        toast.error('Unable to delete file');
      }
    } catch (error) {
      // Handle network errors
      setLoading(false);
      toast.error('Unable to delete file');
    } finally {
      deleteModalClose();
    }
  };
  const handlePaste = async () => {
    setIsContextMenuOpen(false);
    setLoading(true);
    try {
      const copyCutUrl = `${backendUrl}/${
        method === 'copy' ? 'copyFile' : 'cutFile'
      }`;
      const res = await axios.post(
        copyCutUrl,
        {
          sourcePath: sourcePath,
          name: fileName,
          destinationPath: pathValue,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (res.status === 200) {
        await getData();
        setLoading(false);
        toast.success('File pasted');
        dispatch(
          method === 'copy'
            ? copy({ name: '', pathValue: '', method: '' })
            : cut({ name: '', pathValue: '', method: '' }),
        );
      } else {
        setLoading(false);
        toast.error(
          'Operation failed. Please check the source and destination paths.',
        );
      }
    } catch (error) {
      setLoading(false);
      console.error('Error:', error);
      toast.error('unable to paste file.');
    }
  };
  // end of file handling functions

  // Context Menu component
  const ContextMenu = ({ xPos, yPos }) => {
    return (
      <div
        className="context-menu"
        style={{
          position: 'fixed',
          top: yPos,
          left: xPos,
          boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
          zIndex: 1000,
        }}
      >
        <Paper elevation={1} sx={{ padding: '10px' }}>
          <Button sx={{ display: 'flex', gap: '5px' }} onClick={handlePaste}>
            <ContentPasteIcon />
            paste
          </Button>
        </Paper>
      </div>
    );
  };
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isContextMenuOpen && !event.target.closest('.context-menu')) {
        setIsContextMenuOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isContextMenuOpen]);

  // physically document transfer
  const getBranches = async () => {
    try {
      const url = backendUrl + '/getAllBranches';
      const { data } = await axios.post(url, null, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setBranches(data.branches);
      return data.branches;
    } catch (error) {
      console.error('unable to fetch branches');
    }
  };
  const getRoles = async (id) => {
    setFieldsLoading(true);
    const urlRole = backendUrl + '/getRolesInBranch/';
    try {
      const { data } = await axios.post(urlRole + `${id}`, null, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setRoles(data.roles);
    } catch {
      console.error('Error getting roles for selected branch');
    } finally {
      setFieldsLoading(false);
    }
  };
  const getUsers = async (branchValue, roleValue) => {
    setFieldsLoading(true);
    try {
      const url = backendUrl + '/getUsersByRoleInBranch';
      const { _id } = branches.find((item) => item.name === branchValue);
      const id = roles.find((item) => item.role === roleValue);
      const { data } = await axios.post(
        url,
        {
          branchId: _id,
          roleId: id._id,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      setUsers(data.users);
    } catch (error) {
      alert(error);
    } finally {
      setFieldsLoading(false);
    }
  };
  const fileTransfer = () => {
    handleClose();
    setTransfer(true);
  };
  const handleUserBarnch = (event) => {
    const { name, value } = event.target;

    setTransferData((prevData) => ({
      ...prevData,
      userBranch: value,
    }));
    if (value) {
      const { _id } = branches.find((data) => data.name === value);
      setRoles([]);
      getRoles(_id);
    } else {
      setRoles([]);
    }
  };
  const handleUserRole = (event) => {
    const { name, value } = event.target;

    setTransferData((prevData) => ({
      ...prevData,
      role: value,
    }));
    if (value) {
      getUsers(transferData.userBranch, value);
    } else {
      setUsers([]);
    }
  };
  const handleUserSelection = (event) => {
    const { name, value } = event.target;

    setTransferData((prevData) => ({
      ...prevData,
      borrower: value,
    }));
  };
  const handleTransferFile = async () => {
    // console.log({ ...transferData, documentId: properties.id });
    if (!transferData.borrower) {
      toast.warn('Please select a borrower user');
      return;
    }
    if (!transferData.purpose) {
      toast.warn('Please enter a purpose');
      return;
    }
    setFieldsLoading('save');
    try {
      const url = backendUrl + '/borrowDocument';

      const { data } = await axios.post(
        url,
        { ...transferData, documentId: properties.id },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      setFileFolders((prev) =>
        prev.map((item) =>
          item.id == properties.id
            ? {
                ...item,
                physicalHolder: transferData?.borrower,
                isTransferable: false,
              }
            : item,
        ),
      );
      toast.success('File transfer complete!');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setFieldsLoading(false);
      setTransferData({
        userBranch: '',
        documentId: '',
        purpose: '',
        role: '',
        borrower: '',
      });
      setTransfer(false);
    }
  };
  // end of trasnfer functionality

  // files structure formatters
  function formatSize(sizeInBytes) {
    if (sizeInBytes < 1024) {
      return sizeInBytes + ' bytes';
    } else if (sizeInBytes < 1024 * 1024) {
      return (sizeInBytes / 1024).toFixed(1) + ' KB';
    } else {
      return (sizeInBytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
  }
  const truncateFileName = (fname, maxLength = 10) => {
    if (fname.length <= maxLength) {
      return fname;
    }

    const lastDotIndex = fname.lastIndexOf('.');

    if (lastDotIndex > 0 && lastDotIndex < fname.length - 1) {
      // Handle filenames with extensions
      const baseName = fname.slice(0, lastDotIndex);
      const extension = fname.slice(lastDotIndex + 1);

      const truncatedBase =
        baseName.length > maxLength - 5
          ? `${baseName.slice(0, maxLength / 2 - 2)}...${baseName.slice(-3)}`
          : baseName;

      const truncatedExtension =
        extension.length > 10 ? `${extension.slice(0, 7)}...` : extension;

      return `${truncatedBase}.${truncatedExtension}`;
    } else {
      // Handle filenames or folder names without extensions
      return `${fname.slice(0, maxLength / 2 - 2)}...${fname.slice(-3)}`;
    }
  };

  // create folder
  const ModelContent =
    modalContentFor === 'createFolder' ? (
      <>
        <Box
          sx={{
            color: 'white',
            height: '40px',
            width: '100%',
            display: 'flex',
            gap: '3px',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '5px',
            background: '#4E327E',
          }}
        >
          <IconFolderPlus />
          <h2>CREATE FOLDER</h2>
        </Box>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '20px',
          }}
        >
          {/* <form className='create-folder-modal-content'> */}
          {/* <p style={{ fontSize: '18px', marginBottom: '10px' }}>Enter the name of a folder</p> */}
          <div>
            <Typography>Folder Name :</Typography>
            <TextField
              id="folderName"
              // label='Enter Folder Name'
              variant="outlined"
              name="folderName"
              value={folderName}
              onChange={(e) => {
                const inputValue = e.target.value;
                const isValidInput = /^[a-zA-Z0-9_\-()\[\]\s]*$/.test(
                  inputValue,
                );
                if (isValidInput || inputValue === '') {
                  setFolderName(e.target.value);
                }
              }}
              helperText="Field must contain only letters, numbers, and spaces."
              sx={{ width: '100%', marginBottom: '10px' }}
            />
          </div>
          <div className="createFolderButtonsContainer">
            <Button
              variant="contained"
              size="small"
              color="success"
              onClick={createFolder}
              sx={{
                '&:hover': {
                  backgroundColor: '#0056b3',
                },
              }}
            >
              Create
            </Button>
            <Button
              variant="contained"
              size="small"
              onClick={() => setOpen(false)}
              color="error"
              sx={{
                color: 'white',
                '&:hover': {
                  backgroundColor: '#0056b3',
                },
              }}
            >
              Cancel
            </Button>
          </div>
          {/* </form> */}
        </Box>
      </>
    ) : (
      <DropFileInput
        getData={getData}
        setOpen={setOpen}
        setFileFolders={setFileFolders}
        onFileChange={onFileChange}
      />
    );
  // delete confirmation
  const deleteModalContent = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <p style={{ fontSize: '18px', marginBottom: '10px' }}>
        ARE YOU SURE YOU WANT TO DELETE FILE?
      </p>
      <Stack flexDirection="row" gap={3}>
        <Button
          variant="contained"
          size="small"
          color="error"
          onClick={() => handleDelete(itemName)}
          sx={{
            // backgroundColor: 'red',
            // color: 'white',
            '&:hover': {
              backgroundColor: '#ff0000',
            },
          }}
        >
          Yes
        </Button>
        <Button
          variant="outlined"
          size="small"
          onClick={deleteModalClose}
          sx={{
            backgroundColor: '#007bff',
            color: 'white',
            '&:hover': {
              backgroundColor: '#0056b3',
            },
          }}
        >
          No
        </Button>
      </Stack>
    </Box>
  );
  // search and sort
  const handleSearchQueryChange = (e) => {
    setSearchQuery(e.target.value);
  };
  const handleSortByChange = (e) => {
    setSortBy(e.target.value);
  };
  const handleSortOrderChange = (event) => {
    setSortOrder(event.target.value);
  };
  // Mock data for the sort options
  const sortOptions = [
    { value: 'name', label: 'Name' },
    { value: 'date', label: 'Date' },
    { value: 'size', label: 'Size' },
  ];
  const filteredFileFolders = fileFolders
    .filter((item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .sort((a, b) => {
      if (sortBy === 'name') {
        const compareResult = b.name.localeCompare(a.name);
        return sortOrder === 'asc' ? -compareResult : compareResult;
      } else if (sortBy === 'date') {
        const dateA = new Date(a.createdOn);
        const dateB = new Date(b.createdOn);
        const dateCompareResult = dateB - dateA;
        return sortOrder === 'asc' ? -dateCompareResult : dateCompareResult;
      } else if (sortBy === 'size') {
        const sizeCompareResult = b.size - a.size;
        return sortOrder === 'asc' ? sizeCompareResult : -sizeCompareResult;
      }
      return 0;
    });
  useEffect(() => {
    setLoading(true);
    const path = pathValue.slice(2);
    navigate('/files' + path);
  }, [pathValue]);

  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };
  // files filter based on rejected
  const normalFiles = useMemo(
    () => filteredFileFolders.filter((item) => !item?.isRejected),
    [filteredFileFolders],
  );
  const rejectedFiles = filteredFileFolders.filter((item) => item?.isRejected);

  const checkDownloadable = (down, involved) => {
    if (down || involved) {
      return false;
    } else {
      return true;
    }
  };

  // render transfer and submit
  const [userList, setUserList] = useState([]);
  const [submitDocumentLoading, setSubmitDocumentLoading] = useState(false);
  const [openSubmit, setOpenSubmit] = useState(false);
  const [borrower, setBorrower] = useState('');
  const returnDocument = async () => {
    setSubmitDocumentLoading(true);
    const url = backendUrl + '/returnDocument';
    try {
      const res = await axios.post(
        url,
        { documentId: properties?.id, borrower },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setFileFolders((prev) =>
        prev.map((item) =>
          item.id === properties.id
            ? { ...item, isTransferable: true, physicalHolder: borrower }
            : item,
        ),
      );

      toast.success(res.data.message);
      setOpenSubmit(false);
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    } finally {
      setSubmitDocumentLoading(false);
    }
  };
  const RenderActions = () => {
    if (isKeeperOfPhysicalDocs) {
      if (properties?.isTransferable) {
        return (
          <MenuItem
            sx={{ gap: '5px', width: '250px' }}
            onClick={() => {
              setTransfer(true);
              handleClose();
            }}
          >
            <IconTransfer />
            transfer
          </MenuItem>
        );
      } else if (!properties?.physicalHolder) {
        return (
          <MenuItem
            sx={{ gap: '5px', width: '250px' }}
            onClick={() => {
              setOpenSubmit(true);
              handleClose();
            }}
          >
            <IconCircleCheck />
            Submit
          </MenuItem>
        );
      }
    } else {
      return null;
    }
  };
  // ------------------------

  // useEffects
  useEffect(() => {
    const url = backendUrl + '/getUsernames';
    const fetchData = async () => {
      const { data } = await axios.get(url);
      // console.log(data.usernames)
      setUserList(data.users);
    };
    const checkPath = sessionStorage.getItem('path');
    if (checkPath && checkPath !== pathValue) {
      dispatch(onReload(checkPath));
    }
    setLoaded(true);
    fetchData();
    getBranches();
  }, []);
  return (
    <>
      {loading ? (
        <ComponentLoader />
      ) : (
        <Stack>
          <Stack
            flex={showProperties ? '75%' : '100%'}
            sx={{ position: 'relative' }}
            onContextMenu={(e) => handleContextMenu(e, 'viraj')}
          >
            <Stack
              flexDirection="row"
              // justifyContent="space-between"
              sx={{ justifyContent: { xs: 'center', sm: 'space-between' } }}
              flexWrap="wrap"
              gap={1}
              alignItems={'center'}
              mb={1}
            >
              <div className="flex flex-wrap gap-2 bg-gray-200 rounded-lg">
                <button
                  onClick={() => setSelectedTab(0)}
                  className={`px-11 h-10 rounded-lg transition-colors duration-300 text-center border ${
                    selectedTab === 0
                      ? 'bg-blue-500 text-white'
                      : 'bg-white text-gray-700'
                  }`}
                >
                  Normal
                </button>
                <button
                  onClick={() => setSelectedTab(1)}
                  className={`px-11 h-10 rounded-lg transition-colors duration-300 text-center border ${
                    selectedTab === 1
                      ? 'bg-red-500 text-white'
                      : 'bg-white text-gray-700'
                  }`}
                >
                  Rejected
                </button>
              </div>

              <Box>
                <TextField
                  label="Search"
                  sx={{
                    maxWidth: { lg: '250px', xs: '150px' },
                    background: 'white',
                    mr: 1,
                  }}
                  disabled={fileFolders.length === 0 || loading}
                  variant="outlined"
                  size="small"
                  value={searchQuery}
                  onChange={handleSearchQueryChange}
                />

                <FormControl size="small" variant="outlined">
                  <InputLabel>Sort By</InputLabel>
                  <Select
                    size="small"
                    value={sortBy}
                    sx={{ background: 'white' }}
                    disabled={fileFolders.length === 0 || loading}
                    onChange={handleSortByChange}
                    label="Sort By"
                    style={{ minWidth: '150px' }}
                  >
                    {sortOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                    <RadioGroup
                      aria-label="sort-order"
                      name="sortOrder"
                      defaultValue={sortOrder}
                      onChange={handleSortOrderChange}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        padding: '10px',
                      }}
                    >
                      <FormControlLabel
                        value="asc"
                        control={<Radio />}
                        label="Ascending"
                      />
                      <FormControlLabel
                        value="desc"
                        control={<Radio />}
                        label="Descending"
                      />
                    </RadioGroup>
                  </Select>
                </FormControl>
              </Box>
            </Stack>
            <Path />
            <Stack
              direction="row"
              gap="10px"
              flexWrap="wrap"
              sx={{ justifyContent: 'flex-start' }}
              className={styles.customScrollContainer}
              overflow="auto"
              mt={1}
              maxHeight="calc(100vh - 290px)"
            >
              {!loading && selectedTab == 0
                ? normalFiles?.map((item, index) => (
                    <>
                      {item.type === 'folder' ? (
                        <Stack
                          flexWrap="wrap"
                          position="relative"
                          minWidth="150px"
                          height="130px"
                          mr={'10px'}
                          maxWidth="200px"
                          flex={1}
                          key={index}
                        >
                          {/* <Tooltip title={item.name} enterDelay={2000} disableInteractive> */}
                          <Link to={item.name} style={{ height: '100%' }}>
                            <Button
                              onClick={() => handleFolderClick(item.name)}
                              sx={{
                                flexDirection: 'column',
                                backgroundColor: 'white',
                                borderRadius: '15px',
                                border: '1px solid lightgray',
                                width: '100%',
                                padding: '5px',
                                height: '100%',
                                '&:hover': {
                                  border: '1px solid blue',
                                  background: 'white',
                                },
                                textTransform: 'none',
                              }}
                              variant="text"
                              color="primary"
                              size="medium"
                            >
                              <Tooltip
                                title={
                                  item.name.length >= 10 ? item.name : null
                                }
                              >
                                <Box
                                  sx={{
                                    height: '60px',
                                    width: '60px',
                                  }}
                                >
                                  <img
                                    style={{
                                      height: '100%',
                                      width: '100%',
                                    }}
                                    src={imageSrc}
                                    alt="im"
                                  />
                                </Box>
                                <p
                                  style={{
                                    color: 'black',
                                    textAlign: 'center',
                                    margin: 0,
                                  }}
                                >
                                  {item.name.length >= 10
                                    ? truncateFileName(item.name)
                                    : item.name}
                                </p>
                              </Tooltip>
                            </Button>
                          </Link>
                          {/* </Tooltip> */}
                          <IconButton
                            onClick={(e) => handleClick1(e, item.name, item)}
                            sx={{
                              position: 'absolute',
                              right: '0px',
                              top: '5px',
                              padding: '5px',
                            }}
                          >
                            <MoreVertIcon />
                          </IconButton>
                        </Stack>
                      ) : (
                        <Stack
                          flexWrap="wrap"
                          minWidth="150px"
                          mr={'10px'}
                          maxWidth="200px"
                          flex={1}
                          height="130px"
                          position="relative"
                          key={index}
                        >
                          <Tooltip enterNextDelay={500} title={item.name}>
                            <Button
                              onClick={() => {
                                setOpenToolTip(item.name);
                                setTimeout(() => {
                                  setOpenToolTip(null);
                                }, 1500);
                              }}
                              sx={{
                                // border: '1px solid lightgray',
                                flexDirection: 'column',
                                width: '100%',
                                height: '100%',
                                border: '1px solid lightgray',
                                textTransform: 'none',
                                '&:hover': {
                                  border: '1px solid blue',
                                  background: 'white',
                                },
                                backgroundColor:
                                  properties?.id === item?.id && showProperties
                                    ? 'lightblue'
                                    : item?.isRejected
                                    ? '#F7A4A4'
                                    : 'white',
                                borderRadius: '15px',
                                padding: '5px',
                              }}
                              variant="text"
                              color="primary"
                              onDoubleClick={() =>
                                item.onlyMetaData
                                  ? null
                                  : handleView(pathValue, item.name, item?.id)
                              }
                              size="medium"
                            >
                              <div>
                                <img
                                  className={styles.responsive}
                                  src={
                                    ImageConfig[
                                      item.name.split('.').pop().toLowerCase()
                                    ] || ImageConfig['default']
                                  }
                                  alt="File"
                                />
                              </div>
                              <div>
                                <p className={styles.textResponsive}>
                                  {item.name.length <= 10
                                    ? item.name
                                    : truncateFileName(item.name)}
                                </p>
                              </div>
                            </Button>
                          </Tooltip>
                          <IconButton
                            onClick={(e) => handleClick(e, item.name, item)}
                            sx={{
                              position: 'absolute',
                              right: '0px',
                              top: '5px',
                              padding: '5px',
                            }}
                          >
                            <MoreVertIcon />
                          </IconButton>
                        </Stack>
                      )}
                    </>
                  ))
                : !loading &&
                  rejectedFiles?.map((item, index) => (
                    <>
                      {item.type === 'folder' ? (
                        <Stack
                          key={index}
                          flexWrap="wrap"
                          minWidth="150px"
                          mr={'10px'}
                          maxWidth="200px"
                          flex={1}
                          position="relative"
                        >
                          {/* <Tooltip title={item.name} enterDelay={1000}> */}
                          <Link to={item.name} style={{ height: '100%' }}>
                            <Button
                              onClick={() => handleFolderClick(item.name)}
                              sx={{
                                flexDirection: 'column',
                                backgroundColor: 'white',
                                borderRadius: '15px',
                                border: '1px solid lightgray',
                                width: '100%',
                                padding: '5px',
                                height: '100%',
                                textTransform: 'none',
                              }}
                              variant="text"
                              color="primary"
                              size="medium"
                            >
                              <Tooltip
                                title={
                                  item.name.length >= 10 ? item.name : null
                                }
                              >
                                <Box
                                  sx={{
                                    height: '60px',
                                    width: '60px',
                                    transition: 'transform 0.2s ease', // Add transition for smooth effect
                                    '&:hover': {
                                      transform: 'scale(1.3)', // Scale up image on hover
                                    },
                                  }}
                                >
                                  <img
                                    style={{
                                      height: '100%',
                                      width: '100%',
                                    }}
                                    src={imageSrc}
                                    alt="im"
                                  />
                                </Box>
                                <p
                                  style={{
                                    color: 'black',
                                    textAlign: 'center',
                                    margin: 0,
                                  }}
                                >
                                  {item.name.length >= 10
                                    ? truncateFileName(item.name)
                                    : item.name}
                                </p>
                              </Tooltip>
                            </Button>
                          </Link>
                          {/* </Tooltip> */}
                          <IconButton
                            onClick={(e) => handleClick1(e, item.name, item)}
                            sx={{
                              position: 'absolute',
                              right: '0px',
                              top: '5px',
                              padding: '5px',
                            }}
                          >
                            <MoreVertIcon />
                          </IconButton>
                        </Stack>
                      ) : (
                        <Stack
                          key={index}
                          flexWrap="wrap"
                          minWidth="150px"
                          mr={'10px'}
                          maxWidth="200px"
                          flex={1}
                          height="130px"
                          position="relative"
                        >
                          <Tooltip title={item.name}>
                            <Button
                              onClick={() => {
                                setOpenToolTip(item.name);
                                setTimeout(() => {
                                  setOpenToolTip(null);
                                }, 1500);
                              }}
                              sx={{
                                flexDirection: 'column',
                                width: '100%',
                                height: '100%',
                                border: '1px solid lightgray',
                                textTransform: 'none',
                                backgroundColor:
                                  properties?.id === item?.id && showProperties
                                    ? 'lightblue'
                                    : 'white',
                                borderRadius: '15px',
                                padding: '5px',
                              }}
                              variant="text"
                              color="primary"
                              onDoubleClick={() =>
                                handleView(pathValue, item.name, item?.id)
                              }
                              size="medium"
                            >
                              <div>
                                <img
                                  className={styles.responsive}
                                  src={
                                    ImageConfig[
                                      item.name.split('.').pop().toLowerCase()
                                    ] || ImageConfig['default']
                                  }
                                  alt="File"
                                />
                              </div>
                              <div>
                                <p className={styles.textResponsive}>
                                  {item.name.length <= 10
                                    ? item.name
                                    : truncateFileName(item.name)}
                                </p>
                              </div>
                            </Button>
                          </Tooltip>
                          <IconButton
                            onClick={(e) => handleClick(e, item.name, item)}
                            sx={{
                              position: 'absolute',
                              right: '0px',
                              top: '5px',
                              padding: '5px',
                            }}
                          >
                            <MoreVertIcon />
                          </IconButton>
                        </Stack>
                      )}
                    </>
                  ))}
              {/* file system texts start */}
              {loading === false &&
                !error &&
                ((selectedTab === 0 && normalFiles?.length === 0) ||
                (selectedTab === 1 && rejectedFiles?.length === 0) ? (
                  <Stack
                    justifyContent="center"
                    width="100%"
                    height={'50vh'}
                    sx={{
                      backgroundColor: 'white',
                      borderRadius: '15px',
                      border: '1px solid lightgray',
                    }}
                    alignItems="center"
                  >
                    <Typography>
                      {selectedTab === 0
                        ? searchQuery
                          ? 'No item found'
                          : 'There is no Files and folders in current directory'
                        : searchQuery
                        ? 'No item found'
                        : 'There is no rejected files'}
                    </Typography>
                  </Stack>
                ) : null)}
              {error && (
                <Stack
                  justifyContent="center"
                  width="100%"
                  height="100%"
                  alignItems="center"
                >
                  {error}
                </Stack>
              )}

              {/* file system texts end */}
              {fileView && !loading && (
                <View
                  docu={fileView}
                  setFileView={setFileView}
                  handleViewClose={handleViewClose}
                  controls={false}
                />
              )}
            </Stack>
          </Stack>
        </Stack>
      )}
      {/* file actions menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        sx={{ width: '250px', borderRadius: '5px' }}
        // PaperProps={{ elevation: 1 }}
      >
        <MenuItem
          disabled={
            checkDownloadable(
              properties?.isDownloadable || properties?.isInvolvedInProcess,
            ) || properties?.onlyMetaData
          }
          sx={{ gap: '5px' }}
          onClick={() => {
            handleDownload(pathValue, itemName);
          }}
        >
          <IconDownload fontSize="medium" />
          Download
        </MenuItem>
        {/* <hr /> */}
        <MenuItem
          disabled={
            itemName.split('.').pop().trim() === 'zip' ||
            properties?.onlyMetaData
          }
          sx={{ gap: '5px' }}
          onClick={() => {
            handleView(pathValue, itemName, properties.id);
            handleClose();
          }}
        >
          <IconEye />
          View
        </MenuItem>
        {/* <hr /> */}
        <MenuItem
          sx={{ gap: '5px' }}
          onClick={() => handleCopy(itemName)}
          disabled={properties?.isInvolvedInProcess || properties?.onlyMetaData}
        >
          <IconClipboard />
          copy
        </MenuItem>
        {/* <hr /> */}
        <MenuItem
          sx={{ gap: '5px' }}
          onClick={() => handleCut(itemName)}
          disabled={properties?.isInvolvedInProcess || properties?.onlyMetaData}
        >
          <IconScissors />
          cut
        </MenuItem>
        {/* <hr /> */}
        <MenuItem
          sx={{ gap: '5px', width: '250px' }}
          onClick={() => {
            setShowProterties(true);
            handleClose();
          }}
        >
          <IconTool />
          propterties
        </MenuItem>
        {RenderActions()}
        <Divider />
        <MenuItem
          sx={{ color: 'red' }}
          onClick={deleteModalOpen}
          disabled={properties?.isInvolvedInProcess || properties?.onlyMetaData}
        >
          <IconTrash color="red" />
          delete
        </MenuItem>
      </Menu>

      {/* folder actions menu */}
      <Menu
        anchorEl={anchorEl1}
        open={Boolean(anchorEl1)}
        onClose={handleClose}
      >
        <MenuItem
          disabled={!properties?.isDownloadable}
          sx={{ gap: '5px' }}
          onClick={() => {
            handleDownloadFolder(pathValue, itemName);
          }}
        >
          <IconDownload fontSize="medium" />
          Download
        </MenuItem>
        <MenuItem
          sx={{ gap: '5px' }}
          onClick={() => {
            setShowProterties(true);
            handleClose();
          }}
        >
          <IconTool />
          propterties
        </MenuItem>
      </Menu>

      {/* properties menu */}
      {showProperties && (
        <>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              height: '100vh',
              width: '100vw',
              backgroundColor: 'rgba(1, 1, 2, 0.6)',
              zIndex: '98',
            }}
          ></div>
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              padding: '10px',
              minHeight: '400px',
              maxWidth: '80%',
              boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
              backgroundColor: 'white',
              margin: '5px',
              border: '1px solid darkgray',
              zIndex: '99',
            }}
          >
            <IconButton
              onClick={() => setShowProterties(false)}
              sx={{
                top: '5px',
                right: '5px',
                height: '50px',
                width: '50px',
                position: 'absolute',
              }}
            >
              <CloseIcon />
            </IconButton>
            <h2 style={{ textAlign: 'center', marginBottom: '10px' }}>
              PROPERTIES
            </h2>
            <hr style={{ marginBottom: '20px' }} />
            <p>
              <b>Name:</b> {properties.name}
            </p>
            <br />
            {/* <p>type: {properties.type}</p> */}
            <p>
              <b>Size:</b> {formatSize(properties.size)}
            </p>
            <br />
            {/* createdBY: {item.createdBy} */}
            <p>
              <b>Created on:</b>{' '}
              {moment(properties.createdOn).format('DD-MM-YYYY HH:mm')}
            </p>
            <br />
            <p>
              <b>Last Accessed:</b>{' '}
              {moment(properties.lastAccessed).format('DD-MM-YYYY HH:mm')}
            </p>
            <br />
            <p>
              <b>Last Updated:</b>{' '}
              {moment(properties.lastUpdated).format('DD-MM-YYYY HH:mm')}
            </p>
          </div>
        </>
      )}

      {/* create folder */}
      {open && (
        <Modal open={open} onClose={closeModal} className="create-folder-modal">
          <div
            style={{
              gap: '10px',
              position: 'relative',
              width: '90%',
              maxWidth: '400px',
            }}
            className="create-folder-modal-content-container"
          >
            {ModelContent}
          </div>
        </Modal>
      )}

      {/* transfer physical document */}
      {isTransfer && (
        <Dialog
          open={isTransfer}
          onClose={() => setTransfer(false)}
          // className="create-folder-modal"
          maxWidth="md"
          fullWidth
        >
          <Paper
            elevation={0}
            sx={{
              width: '100%',
              padding: '20px',
              display: 'flex',
              gap: '10px',
              flexDirection: 'column',
              border: '1px solid lightgray',
            }}
          >
            {/* <Grid item xs={12}> */}
            <Typography variant="body1">Borrower Branch:</Typography>
            <FormControl fullWidth variant="outlined">
              <Select
                name="userBranch"
                size="small"
                disabled={!!fieldsLoading}
                sx={{ backgroundColor: 'whitesmoke' }}
                value={transferData?.userBranch}
                onChange={handleUserBarnch}
              >
                <MenuItem value="" disabled>
                  <em>None</em>
                </MenuItem>
                {branches?.map((data) => (
                  <MenuItem key={data.name} value={data.name}>
                    {data.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {/* </Grid> */}
            {/* <Grid item xs={12}> */}
            <Typography variant="body1">Borrower Role:</Typography>
            <FormControl fullWidth variant="outlined">
              <Select
                name="role"
                size="small"
                disabled={!!fieldsLoading}
                sx={{ backgroundColor: 'whitesmoke' }}
                value={transferData?.role}
                onChange={handleUserRole}
              >
                <MenuItem value="" disabled>
                  <em>None</em>
                </MenuItem>
                {roles?.map((data) => (
                  <MenuItem key={data.role} value={data.role}>
                    {data.role}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {/* </Grid> */}
            {/* <Grid item xs={12}> */}
            <Typography variant="body1">Borrower User:</Typography>
            <FormControl fullWidth variant="outlined">
              <Select
                name="user"
                size="small"
                sx={{ backgroundColor: 'whitesmoke' }}
                value={transferData?.borrower}
                disabled={!!fieldsLoading}
                onChange={handleUserSelection}
              >
                <MenuItem value="" disabled>
                  <em>None</em>
                </MenuItem>
                {users?.map((data) => (
                  <MenuItem key={data.username} value={data.username}>
                    {data.username}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="body1">Purpose :</Typography>
            <TextField
              name="purpose"
              disabled={!!fieldsLoading}
              sx={{ backgroundColor: 'whitesmoke' }}
              onChange={(e) =>
                setTransferData((prevData) => ({
                  ...prevData,
                  purpose: e.target.value,
                }))
              }
              size="small"
            />
            <Button
              variant="outlined"
              disabled={fieldsLoading === 'save'}
              sx={{ mt: 1, width: '150px', mx: 'auto' }}
              onClick={handleTransferFile}
            >
              {!fieldsLoading ? (
                'Transfer File'
              ) : (
                <CircularProgress size={22} />
              )}
            </Button>
          </Paper>
        </Dialog>
      )}

      {/* Delete confirmation modal */}
      {isModalOpen && (
        <Modal
          open={isModalOpen}
          onClose={deleteModalClose}
          className="create-folder-modal"
        >
          <div
            style={{ gap: '10px', position: 'relative' }}
            className="create-folder-modal-content-container"
          >
            {deleteModalContent}
          </div>
        </Modal>
      )}

      {/* Paste document key */}
      {isContextMenuOpen && fileName && (
        <ContextMenu
          xPos={contextMenuPos.x}
          yPos={contextMenuPos.y}
          handlePaste={handlePaste}
        />
      )}

      {/* color for plus background background: 'linear-gradient(to right, #3E5151 , #DECBA4)' */}
      {isUploadable && (
        <Stack
          position="fixed"
          flexDirection={'row'}
          alignItems={'center'}
          sx={{
            bottom: '25px',
            right: '-325px',
            transition: 'right 0.3s ease-in-out',
            '&:hover': {
              right: '10px',
            },
          }}
        >
          <IconChevronsLeft
            size={57}
            // color="purple"
            style={{
              background: 'white',
              color: 'var(--themeColor)',
              padding: '10px',
              borderRight: 0,
              border: '1px solid lightgray',
              borderRadius: '50% 0 0 50%',
            }}
          />
          <Stack
            flexDirection={'row'}
            gap={1}
            padding={1}
            sx={{
              boxShadow: 'rgba(149, 157, 165, 0.2) 0px 8px 24px',
              backgroundColor: 'white',
              border: '1px solid lightgray',
              borderRadius: '0 8px 8px 0',
            }}
          >
            <Button
              sx={{
                flexDirection: 'row',
                width: '150px',
                padding: '10px',
                height: '40px',
                alignItems: 'center',
              }}
              // color='info'
              size="medium"
              variant="contained"
              onClick={() => openModal('createFolder')}
            >
              <IconFolderPlus size={17} style={{ marginRight: '3px' }} />
              {/* <img src={imageSrc} alt="image" /> */}
              <p
                style={{
                  fontSize: '12px',
                  textAlign: 'center',
                  color: 'white',
                }}
              >
                NEW FOLDER
              </p>
            </Button>
            <Button
              sx={{
                flexDirection: 'row',
                width: '150px',
                padding: '10px',
                height: '40px',
                alignItems: 'center',
              }}
              variant="contained"
              size="medium"
              onClick={() => openModal('uploadFiles')}
            >
              <IconUpload size={16} style={{ marginRight: '3px' }} />
              <p
                style={{
                  fontSize: '12px',
                  textAlign: 'center',
                  color: 'white',
                }}
              >
                UPLOAD FILE
              </p>
            </Button>
          </Stack>
        </Stack>
      )}

      {/* submit document to document keeper */}
      <Dialog
        open={openSubmit}
        onClose={() => (!submitDocumentLoading ? setOpenSubmit(false) : null)}
      >
        <form>
          <DialogTitle
            sx={{
              background: 'var(--themeColor)',
              margin: '5px',
              color: ' white',
            }}
          >
            Select Document Submitter
          </DialogTitle>
          <DialogContent sx={{ padding: '10px' }}>
            <Autocomplete
              onChange={(event, newValue) => setBorrower(newValue.username)}
              options={userList || []}
              sx={{ margin: '5px' }}
              getOptionLabel={(option) =>
                `${option.username} (Role-${option.role}, Branch-${option.branch})`
              }
              isOptionEqualToValue={(option, value) =>
                option.username === value
              }
              renderInput={(params) => (
                <TextField {...params} label="Select User" required fullWidth />
              )}
            />
          </DialogContent>
          <DialogActions>
            <Button
              variant="contained"
              disabled={submitDocumentLoading}
              onClick={returnDocument}
            >
              {submitDocumentLoading ? (
                <CircularProgress size={22} />
              ) : (
                'Submit'
              )}
            </Button>
            <Button
              onClick={() => setOpenSubmit(false)}
              disabled={submitDocumentLoading}
            >
              Cancel
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
