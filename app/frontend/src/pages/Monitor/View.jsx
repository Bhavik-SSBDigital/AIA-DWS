import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  FormControl,
  IconButton,
  Menu,
  MenuItem,
  Modal,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import React, { useEffect, useState } from 'react';
import ViewFile from '../view/View';
import {
  IconBan,
  IconDownload,
  IconEye,
  IconFileOff,
  IconUpload,
  IconWritingSign,
  IconX,
} from '@tabler/icons-react';

// components
import styles from './View.module.css';
import { ImageConfig } from '../../config/ImageConfig';

// libraries
import moment from 'moment';
// icons
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { download } from '../../components/drop-file-input/FileUploadDownload';
import { IconHourglassEmpty } from '@tabler/icons-react';
import { IconChecks } from '@tabler/icons-react';
import { useQueryClient } from 'react-query';
import ComponentLoader from '../../common/Loader/ComponentLoader';

export default function View() {
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const receivedData = params.get('data');
  const workflowFollow = params.get('workflow');
  const workFlowToBeFollowed = decodeURIComponent(workflowFollow);
  const viewId = decodeURIComponent(receivedData);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState();
  const [rejectFileModalOpen, setRejectFileModalOpen] = useState(false);
  const [fileView, setFileView] = useState();
  const [signLoading, setSignLoading] = useState(false);
  const [rejectFileLoading, setRejectFileLoading] = useState(false);
  const [reasonOfRejection, setReasonOfRejection] = useState();
  const [rejectFileId, setRejectFileId] = useState();

  const InfoRow = ({ label, value }) => (
    <Stack
      flexDirection="row"
      justifyContent="space-between"
      sx={{
        minWidth: { xs: '99%', sm: '500px', md: '70%' },
        background: '#f9f9f9',
        margin: '5px',
        borderLeft: '4px solid #6C22A6',
        borderRadius: '5px',
        backgroundColor: '#eeeeee',
      }}
    >
      <p style={{ padding: '5px', fontWeight: 'bold' }}>{label}:</p>
      <p style={{ padding: '5px' }}>{value}</p>
    </Stack>
  );
  const lastWork = data?.workFlow[data?.lastStepDone - 1];

  //   states
  const [workFlowId, setWorkFlowId] = useState('');
  const [rejectProcessLoading, setRejectProcessLoading] = useState(false);
  const [sendToClerkMenu, setSendToClerkMenu] = useState(null);
  const [sendLoading, setSendLoading] = useState(false);
  const [rejectProcessMenu, setRejectProcessMenu] = useState(false);
  const [rejectProcessId, setRejectProcessId] = useState();
  const [rejectProcessRemarks, setRejectProcessRemarks] = useState('');
  const [rejectedMenu, setRejectedMenu] = useState(null);
  const [signedBy, setSignedBy] = useState([]);
  const [anchorEl2, setAnchorEl2] = useState(null);
  const [file, setFile] = useState([]);
  const [anchorEl1, setAnchorEl1] = useState(null);
  const [itemName, setItemName] = useState('');
  const [remarks, setRemarks] = useState('');
  const [fileToBeOperated, setFileToBeOperated] = useState({
    signedBy: [],
  });
  // file actions
  const handleView = async (path, name) => {
    setLoading(true);
    try {
      const fileData = await download(name, path, true);
      if (fileData) {
        setFileView({ url: fileData.data, type: fileData.fileType });
        setLoading(false);
      } else {
        console.error('Invalid fileData:', fileData);
        toast.error('Invalid file data.');
        setLoading(false);
      }
    } catch (error) {
      console.error('Error viewing file:', error);
      toast.error('Unable to view the file.');
      setLoading(false);
    }
    handleClose();
  };
  const handleDownload = (path, name) => {
    try {
      download(name, path);
    } catch (error) {
      console.error('Error downloading file:', error);
      toast.error('An error occurred while downloading the file.');
    }
    handleClose();
  };
  const handleSign = async (processId, fileId) => {
    setSignLoading((value) => !value);
    const signUrl = backendUrl + '/signDocument';
    try {
      const res = await axios.post(
        signUrl,
        {
          processId: processId,
          documentId: fileId,
          workFlowToBeFollowed: workFlowId,
        },
        {
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem('accessToken')}`,
          },
        },
      );

      if (res.status === 200) {
        toast.success('Document signed');
        setData((prevProcessData) => {
          // create a copy of the previous state
          const updatedProcessData = { ...prevProcessData };

          // Find the document to update
          const documents = updatedProcessData.documents.map((file) => {
            if (file.details._id === fileId) {
              // Update the signedBy array
              return {
                ...file,
                signedBy: [
                  ...file.signedBy,
                  { username: sessionStorage.getItem('username') },
                ],
              };
            }
            return file;
          });

          // Update the documents array in the state
          updatedProcessData.documents = documents;

          // Return the updated state
          return updatedProcessData;
        });
        setSignLoading((value) => !value);
      }
    } catch (error) {
      // console.log('error', error);
      toast.error(error.response.data.message);
      setSignLoading(false);
    }
  };
  const handleSignClick = async () => {
    await handleSign(data._id, fileToBeOperated.details._id);
    handleClose();
  };
  const CloseRejectFileModal = () => {
    setReasonOfRejection('');
    setRejectFileModalOpen(false);
  };
  const handleClose = () => {
    setAnchorEl1(null);
  };
  const handleRejectFile = async (processId, fileId) => {
    setRejectFileLoading(true);
    const rejectUrl = backendUrl + '/rejectDocument';
    try {
      const res = await axios.post(
        rejectUrl,
        {
          processId: processId,
          documentId: fileId,
          reason: reasonOfRejection,
          workFlowToBeFollowed: workFlowId,
        },
        {
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem('accessToken')}`,
          },
        },
      );
      if (res.status === 200) {
        toast.success('Document is rejected');
        setData((prevProcessData) => {
          const updatedProcessData = { ...prevProcessData };

          const documents = updatedProcessData.documents.map((file) => {
            if (file.details._id === fileToBeOperated.details._id) {
              // Update the signedBy array
              return {
                ...file,
                rejection: sessionStorage.getItem('username'),
              };
            }
            return file;
          });

          // Update the documents array in the state
          updatedProcessData.documents = documents;

          // Return the updated state
          return updatedProcessData;
        });
      }
    } catch (error) {
      toast.error('not able to reject document');
    }
    CloseRejectFileModal();
    setReasonOfRejection('');
    setRejectFileLoading(false);
  };
  const openRejectFileModal = () => {
    setRejectFileModalOpen(true);
  };
  //   handlers
  const [works, setWorks] = useState([]);
  const [selectedWork, setSelectedWork] = useState('');
  const getWorks = async () => {
    try {
      const url = backendUrl + '/getWorks';
      const accessToken = sessionStorage.getItem('accessToken');
      const { data } = await axios.post(url, null, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      setWorks(data.works);
    } catch (error) {
      // console.log(error);
    }
  };
  const handleWorkChange = (e) => {
    setSelectedWork(e.target.value);
  };
  const sendToClerk = async (workFlowToBeFollowed) => {
    setSendLoading(true);
    if (selectedWork === '') {
      toast.info('please select work');
      setSendLoading(false);
      return;
    }
    const clerkUrl = backendUrl + `/sendToClerk/${viewId}`;
    try {
      const res = await axios.post(
        clerkUrl,
        {
          work: selectedWork,
          workFlowToBeFollowed: workFlowToBeFollowed,
          remarks,
        },
        {
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem('accessToken')}`,
          },
        },
      );
      if (res.status === 200) {
        toast.success('Sent to clerk');
        setSendLoading(false);
        queryClient.removeQueries(['pendingProcesses', 'monitor']);
      }
    } catch (error) {
      toast.error(error);
      setSendLoading(false);
    } finally {
      setSendToClerkMenu(false);
      navigate('/monitor');
    }
  };
  const rejectProcess = async (processId) => {
    setRejectProcessLoading(true);
    const rejectProcessUrl = backendUrl + `/rejectFromHeadOffice/${processId}`;
    try {
      const res = await axios.post(
        rejectProcessUrl,
        {
          workFlowToBeFollowed: rejectProcessId,
          Remarks: rejectProcessRemarks,
        },
        {
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem('accessToken')}`,
          },
        },
      );
      if (res.status === 200) {
        toast.success('Rejected');
        const updatedConnectors = data?.connectors?.map((connector) => {
          if (connector.workflowId === rejectProcessId) {
            return {
              ...connector,
              isCompleted: false,
            };
          } else {
            return connector;
          }
        });
        const updatedStateData = {
          ...data,
          connectors: updatedConnectors,
        };
        setData(updatedStateData);
      }
    } catch (error) {
      toast.error('Error in rejecting');
    } finally {
      setRejectProcessRemarks('');
      setRejectProcessId('');
      setRejectProcessLoading(false);
      setRejectProcessMenu(false);
    }
  };
  const handleOpenRejectedMenu = (e) => {
    setRejectedMenu(e.currentTarget);
  };
  const handleViewClose = () => {
    setFileView(null);
  };
  const checkFileIsOperable = () => {
    // const clickedFile = processData.documents[i];
    return (
      fileToBeOperated.signedBy
        .map((item) => item.username)
        .includes(sessionStorage.getItem('username')) ||
      fileToBeOperated.rejection !== undefined
    );
  };
  const handleOpenSignedByMenu = (e) => {
    setAnchorEl2(e.currentTarget);
  };
  const handleClick1 = (event, name, item) => {
    setItemName(name);
    setAnchorEl1(event.currentTarget);
  };
  const truncateFileName = (fname, maxLength = 25) => {
    if (fname.length <= maxLength) {
      return fname;
    } else {
      const [baseName, extension] = fname.split('.').reduce(
        (result, part, index, array) => {
          if (index === array.length - 1) {
            result[1] = part;
          } else {
            result[0] += part;
          }
          return result;
        },
        ['', ''],
      );
      const truncatedName = `${baseName.slice(0, 15)}...${baseName.slice(-2)}`;
      return `${truncatedName}.${extension}`;
    }
  };

  // tabs switch
  const [value, setValue] = useState(1);

  const handleChange = (event, newValue) => {
    setValue(newValue);
  };
  const fetchViewData = async () => {
    // setProcessData([]);
    let shouldNavigate = false;
    try {
      const url = backendUrl + `/getProcess/${viewId}`;
      const res = await axios.post(
        url,
        { workFlowToBeFollowed, forMonitoring: true },
        {
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem('accessToken')}`,
          },
        },
      );
      setData(res.data.process);
    } catch (error) {
      shouldNavigate = true;
    } finally {
      setLoading(false);
    }
    if (shouldNavigate) {
      navigate('/monitor');
      toast.error('Unable to fetch process data');
    }
  };
  useEffect(() => {
    fetchViewData();
    getWorks();
  }, []);
  return (
    <>
      {loading ? (
        <ComponentLoader />
      ) : (
        <Stack flexDirection="row">
          <div
            className={styles.padding}
            style={{
              width: '100%',
              position: 'relative',
              overflow: 'auto',
            }}
          >
            <Stack sx={{ padding: '5px' }}>
              <Typography variant="h6">Your Department :</Typography>
              <Box
                sx={{ backgroundColor: 'white', border: '1px solid lightgray' }}
              >
                <Stack>
                  <Stack
                    alignItems="center"
                    sx={{
                      marginBottom: '20px',
                      padding: '15px',
                    }}
                  >
                    <InfoRow label="Name" value={data?.name} />
                    <InfoRow
                      label="Status"
                      value={
                        data?.completed ? (
                          <span style={{ color: 'green' }}>Completed</span>
                        ) : (
                          <span style={{ color: 'red' }}>Pending</span>
                        )
                      }
                    />
                    <InfoRow
                      label="Document Path"
                      value={data?.documentsPath}
                    />
                    <InfoRow
                      label="Created Date"
                      value={moment(data?.createdAt).format(
                        'DD-MM-YYYY hh:mm A',
                      )}
                    />
                    <InfoRow
                      label="Previous Step"
                      value={
                        data?.lastStepDone === 0
                          ? 'Process is just initiated'
                          : `last step was ${lastWork?.work}`
                      }
                    />
                    <InfoRow
                      label="Remarks"
                      value={data?.remarks ? data?.remarks : 'No Remarks'}
                    />
                    <InfoRow label="Documents" />
                  </Stack>
                </Stack>
                <Box sx={{ width: '99%', overflow: 'auto' }}>
                  <Stack
                    flexDirection="row"
                    gap={1}
                    flexWrap="wrap"
                    justifyContent="center"
                  >
                    {data?.documents?.map((file, index) => {
                      // const i = index;
                      const clickedFile = data?.documents[index];
                      return (
                        <Box sx={{ padding: '10px' }} key={file?.details?._id}>
                          <Stack
                            sx={{
                              minHeight: 'fit-content',
                              width: '250px',
                              borderRadius: '15px',
                              flex: '1 1 auto',
                              margin: '10px',
                              backgroundColor: 'white',
                              boxShadow:
                                '2px 2px 6px -1px rgba(0,0,0,0.2), 0px 0px 8px 0px rgba(0,0,0,-0.86), 0px 0px 6px 3px rgba(1,1,2,0.12)',
                            }}
                            // gap={2}
                          >
                            <div className={styles.filePartOne}>
                              <div className={styles.fileHeading}>
                                <h5
                                  style={{
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    marginRight: '15px',
                                  }}
                                >
                                  {file?.rejection &&
                                  Object.keys(file.rejection).length > 0 ? (
                                    <p
                                      style={{
                                        color: 'red',
                                        display: 'flex',
                                        alignItems: 'center',
                                      }}
                                    >
                                      <Button
                                        onClick={(e) => {
                                          handleOpenRejectedMenu(e);
                                          setFile(file);
                                        }}
                                        startIcon={<IconBan />}
                                        sx={{ color: 'red' }}
                                      >
                                        Rejected
                                      </Button>
                                    </p>
                                  ) : file?.signedBy
                                      .map((item) => item.username)
                                      .includes(
                                        sessionStorage.getItem('username'),
                                      ) ? (
                                    <Button
                                      onClick={(e) => {
                                        handleOpenSignedByMenu(e);
                                        setSignedBy(file.signedBy);
                                      }}
                                      style={{ color: 'green', zIndex: '999' }}
                                    >
                                      signed
                                    </Button>
                                  ) : (
                                    <p style={{ color: 'red' }}>un-signed</p>
                                  )}
                                </h5>
                                <IconButton
                                  onClick={(e) => {
                                    handleClick1(e, file?.details?.name, file);
                                    setFileToBeOperated({
                                      ...file,
                                    });
                                    setWorkFlowId(data?.processWorkFlow);
                                  }}
                                >
                                  <MoreVertIcon />
                                </IconButton>
                              </div>
                            </div>

                            <div>
                              <div className={styles.iconContainer}>
                                <img
                                  style={{
                                    width: '70px',
                                    height: '70px',
                                  }}
                                  src={
                                    ImageConfig[
                                      file?.details?.name
                                        .split('.')
                                        .pop()
                                        .toLowerCase()
                                    ] || ImageConfig['default']
                                  }
                                  alt=""
                                />
                              </div>
                              <div className={styles.fileNameContainer}>
                                <Tooltip
                                  title={file.details.name}
                                  enterDelay={900}
                                >
                                  <h4>
                                    {file?.details?.name <= 20
                                      ? file.details.name
                                      : truncateFileName(file.details.name)}
                                  </h4>
                                </Tooltip>
                              </div>
                              <div className={styles.fileTimeContainer}>
                                <p>
                                  -{' '}
                                  {moment(file?.details?.createdOn).format(
                                    'DD-MMM-YYYY hh:mm A',
                                  )}
                                </p>
                              </div>
                            </div>
                            <div className={styles.filePartTwo}>
                              {/* <p className={styles.fileElements}>
                              <b>Work assigned</b> :{file?.workName}
                            </p> */}
                              <p className={styles.fileElements}>
                                <b>Cabinet no</b> : {file?.cabinetNo}
                              </p>
                            </div>
                          </Stack>
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
              </Box>
              <Box>
                <Typography variant="h6">Connetors :</Typography>
                {/* <Stack sx={{ marginY: "10px" }} alignItems="flex-end">
              <TextField onChange={handleSearch} label="search" sx={{ width: "200px" }} size="small"></TextField>
            </Stack> */}
                {data?.connectors?.map((data, inn) => {
                  return (
                    <>
                      <Accordion
                        sx={{
                          boxShadow:
                            'rgba(0, 0, 0, 0.02) 0px 1px 3px 0px, rgba(27, 31, 35, 0.15) 0px 0px 0px 1px',
                        }}
                      >
                        <AccordionSummary
                          expandIcon={<ExpandMoreIcon />}
                          aria-controls={`panel${inn}-content`}
                          id={`panel${inn}-content`}
                        >
                          <Stack
                            flexDirection="row"
                            alignItems="center"
                            justifyContent="space-between"
                            sx={{ width: '100%' }}
                          >
                            <h4
                              style={{
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                              }}
                            >
                              {data.departmentName}
                              {data.isCompleted ? (
                                <>
                                  <IconChecks color="green" />
                                </>
                              ) : (
                                <>
                                  <IconHourglassEmpty color="red" />
                                </>
                              )}
                            </h4>
                            {/* <p>
                            {data.isCompleted ? (
                              <>
                                <p>Status : </p> <IconChecks color="green" />
                              </>
                            ) : (
                              <IconHourglassEmpty color="red" />
                            )}
                          </p> */}
                          </Stack>
                          {data?.isCompleted && (
                            <Button
                              onClick={() => {
                                setRejectProcessMenu(true);
                                setRejectProcessId(data?.workflowId);
                              }}
                              color="error"
                            >
                              Reject
                            </Button>
                          )}
                        </AccordionSummary>
                        <AccordionDetails>
                          <Stack
                            flexDirection="row"
                            gap={1}
                            flexWrap="wrap"
                            justifyContent="center"
                          >
                            {data?.documents?.length ? (
                              data?.documents?.map((file, index) => {
                                return (
                                  <Box
                                    sx={{ padding: '10px' }}
                                    key={file?.details?._id}
                                  >
                                    <Stack
                                      sx={{
                                        minHeight: 'fit-content',
                                        width: '250px',
                                        borderRadius: '15px',
                                        flex: '1 1 auto',
                                        margin: '10px',
                                        backgroundColor: 'white',
                                        boxShadow:
                                          '2px 2px 6px -1px rgba(0,0,0,0.2), 0px 0px 8px 0px rgba(0,0,0,-0.86), 0px 0px 6px 3px rgba(1,1,2,0.12)',
                                      }}
                                      // gap={2}
                                    >
                                      <div className={styles.filePartOne}>
                                        <div className={styles.fileHeading}>
                                          <h5
                                            style={{
                                              height: '100%',
                                              display: 'flex',
                                              alignItems: 'center',
                                              marginRight: '15px',
                                            }}
                                          >
                                            {file?.rejection &&
                                            Object.keys(file.rejection).length >
                                              0 ? (
                                              <p
                                                style={{
                                                  color: 'red',
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                }}
                                              >
                                                <Button
                                                  onClick={(e) => {
                                                    handleOpenRejectedMenu(e);
                                                    setFile(file);
                                                  }}
                                                  startIcon={<IconBan />}
                                                  sx={{ color: 'red' }}
                                                >
                                                  Rejected
                                                </Button>
                                              </p>
                                            ) : file?.signedBy
                                                .map((item) => item.username)
                                                .includes(
                                                  sessionStorage.getItem(
                                                    'username',
                                                  ),
                                                ) ? (
                                              <Button
                                                onClick={(e) => {
                                                  handleOpenSignedByMenu(e);
                                                  setSignedBy(file.signedBy);
                                                }}
                                                style={{
                                                  color: 'green',
                                                  zIndex: '999',
                                                }}
                                              >
                                                signed
                                              </Button>
                                            ) : (
                                              <p style={{ color: 'red' }}>
                                                un-signed
                                              </p>
                                            )}
                                          </h5>
                                          <IconButton
                                            onClick={(e) => {
                                              handleClick1(
                                                e,
                                                file?.details?.name,
                                                file,
                                              );
                                              setFileToBeOperated({
                                                ...file,
                                              });
                                              setWorkFlowId(data?.workflowId);
                                            }}
                                          >
                                            <MoreVertIcon />
                                          </IconButton>
                                        </div>
                                      </div>

                                      <div>
                                        <div className={styles.iconContainer}>
                                          <img
                                            style={{
                                              width: '70px',
                                              height: '70px',
                                            }}
                                            src={
                                              ImageConfig[
                                                file?.details?.name
                                                  .split('.')
                                                  .pop()
                                                  .toLowerCase()
                                              ] || ImageConfig['default']
                                            }
                                            alt=""
                                          />
                                        </div>
                                        <div
                                          className={styles.fileNameContainer}
                                        >
                                          <Tooltip
                                            title={file.details.name}
                                            enterDelay={900}
                                          >
                                            <h4>
                                              {file?.details?.name <= 20
                                                ? file.details.name
                                                : truncateFileName(
                                                    file.details.name,
                                                  )}
                                            </h4>
                                          </Tooltip>
                                        </div>
                                        <div
                                          className={styles.fileTimeContainer}
                                        >
                                          <p>
                                            -{' '}
                                            {moment(
                                              file?.details?.createdOn,
                                            ).format('DD-MMM-YYYY hh:mm A')}
                                          </p>
                                        </div>
                                      </div>
                                      <div className={styles.filePartTwo}>
                                        {/* <p className={styles.fileElements}>
                                        <b>Work assigned</b> :{file?.workName}
                                      </p> */}
                                        <p className={styles.fileElements}>
                                          <b>Cabinet no</b> : {file?.cabinetNo}
                                        </p>
                                      </div>
                                    </Stack>
                                  </Box>
                                );
                              })
                            ) : (
                              <h3>No Documents Uploaded</h3>
                            )}
                          </Stack>
                        </AccordionDetails>
                      </Accordion>
                    </>
                  );
                })}
              </Box>
              {data?.connectors?.filter((item) => item.isCompleted === false)
                .length === 0 ? (
                <Stack alignItems="center" m={1}>
                  <Button
                    onClick={() => setSendToClerkMenu(true)}
                    size="medium"
                    sx={{ width: '200px' }}
                    variant="contained"
                  >
                    SEND TO CLERK
                  </Button>
                </Stack>
              ) : null}
            </Stack>
          </div>
          <Menu
            anchorEl={anchorEl1}
            open={Boolean(anchorEl1)}
            onClose={() => setAnchorEl1(null)}
            PaperProps={{ elevation: 2 }}
          >
            <MenuItem
              disabled={itemName.split('.').pop().trim() === 'zip'}
              sx={{ gap: '5px' }}
              onClick={() => {
                handleView(data.documentsPath, itemName);
                handleClose();
              }}
            >
              <IconEye />
              View
            </MenuItem>
            <MenuItem
              disabled={itemName?.split('.').pop().trim() === 'zip'}
              sx={{ gap: '5px' }}
              onClick={() => {
                handleDownload(data?.documentsPath, itemName);
                handleClose();
              }}
            >
              <IconDownload />
              Download
            </MenuItem>
            <MenuItem
              // disabled={
              //   itemName.split(".").pop().trim() === "zip"
              // }
              sx={{ gap: '5px' }}
              onClick={async () => {
                await handleSignClick();
              }}
              disabled={checkFileIsOperable() || signLoading}
            >
              <IconWritingSign />
              Sign
            </MenuItem>
            <MenuItem
              sx={{ gap: '5px' }}
              onClick={() => {
                setRejectFileId(fileToBeOperated.details._id);
                handleClose();
                openRejectFileModal();
              }}
              disabled={checkFileIsOperable() || rejectFileLoading}
            >
              <IconFileOff />
              Reject
            </MenuItem>
          </Menu>
          <Menu
            anchorEl={anchorEl2}
            open={Boolean(anchorEl2)}
            onClose={() => setAnchorEl2(null)}
          >
            {signedBy?.map((item) => (
              <MenuItem key={item.username}>{item.username}</MenuItem>
            ))}
          </Menu>
          <Menu
            anchorEl={rejectedMenu}
            open={Boolean(rejectedMenu)}
            onClose={() => setRejectedMenu(false)}
          >
            <div
              style={{
                padding: '10px',
                maxWidth: '300px',
                maxHeight: '150px',
                overflow: 'auto',
              }}
            >
              <strong>Rejected By:</strong> {file?.rejection?.step?.user}
              <br />
              <strong>Reason:</strong> {file?.rejection?.reason}
            </div>
          </Menu>
          <Modal
            open={rejectFileModalOpen}
            // onClose={CloseRejectFileModal}
            className={styles.modalDesign}
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
                position: 'relative',
                padding: '18px',
                borderRadius: '10px',
                backgroundColor: '#fff',
                boxShadow: '0px 2px 5px rgba(0, 0, 0, 0.1)',
              }}
            >
              <Box
                sx={{
                  background: 'lightblue',
                  padding: '5px',
                  mb: '10px',
                  borderRadius: '5px',
                }}
              >
                <Typography variant="h6" sx={{ marginBottom: '10px' }}>
                  Give reason why you want to reject this file!!!
                </Typography>
              </Box>
              <Stack
                alignItems="center"
                justifyContent="center"
                spacing={1}
                sx={{
                  alignSelf: 'center',
                  marginBottom: '10px',
                  width: '100%',
                }}
              >
                <Box sx={{ width: '100%' }}>
                  <Typography>Reason Of Rejection:</Typography>
                  <TextField
                    variant="outlined"
                    size="small"
                    fullWidth
                    onChange={(e) => setRejectProcessRemarks(e.target.value)}
                  />
                </Box>
              </Stack>
              <Stack flexDirection="row" gap={2}>
                <Button
                  variant="contained"
                  color="error"
                  disabled={rejectFileLoading}
                  onClick={() => handleRejectFile(data?._id, rejectFileId)}
                >
                  {rejectFileLoading ? (
                    <CircularProgress size={20} />
                  ) : (
                    'Reject File'
                  )}
                </Button>
                <Button
                  disabled={rejectFileLoading}
                  variant="contained"
                  // color="error"
                  onClick={() => setRejectFileModalOpen(false)}
                >
                  Cancel
                </Button>
              </Stack>
            </Box>
          </Modal>
          <Modal
            open={rejectProcessMenu}
            // onClose={CloseRejectFileModal}
            className={styles.modalDesign}
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
                position: 'relative',
                padding: '18px',
                borderRadius: '10px',
                backgroundColor: '#fff',
                boxShadow: '0px 2px 5px rgba(0, 0, 0, 0.1)',
              }}
            >
              <Box
                sx={{
                  background: 'lightblue',
                  mb: '10px',
                  borderRadius: '5px',
                  width: '100%',
                }}
              >
                <Typography
                  variant="h6"
                  sx={{ marginBottom: '10px', textAlign: 'center' }}
                >
                  Reason Of Rejection
                </Typography>
              </Box>
              <Stack
                alignItems="center"
                justifyContent="center"
                spacing={1}
                sx={{
                  alignSelf: 'center',
                  marginBottom: '10px',
                  width: '100%',
                }}
              >
                <Box sx={{ width: '100%' }}>
                  <Typography>Reason of rejection:</Typography>
                  <TextField
                    variant="outlined"
                    multiline
                    size="small"
                    fullWidth
                    onChange={(e) => setReasonOfRejection(e.target.value)}
                  />
                </Box>
              </Stack>
              <Stack flexDirection="row" gap={2}>
                <Button
                  variant="contained"
                  color="error"
                  disabled={rejectProcessLoading}
                  onClick={() => rejectProcess(data?._id)}
                >
                  {rejectProcessLoading ? (
                    <CircularProgress size={25} />
                  ) : (
                    'Reject Process'
                  )}
                </Button>
                <Button
                  variant="contained"
                  disabled={rejectProcessLoading}
                  // color="error"
                  onClick={() => setRejectProcessMenu(false)}
                >
                  Cancel
                </Button>
              </Stack>
              {rejectFileLoading && (
                <Stack alignItems="center">
                  <CircularProgress color="inherit" size={30} />
                </Stack>
              )}
            </Box>
          </Modal>
          <Dialog open={sendToClerkMenu}>
            <h3
              style={{
                textAlign: 'center',
                padding: '10px',
                backgroundColor: 'lightblue',
                margin: '10px',
                borderRadius: '5px',
              }}
            >
              Select work
            </h3>
            <Box width={300} padding={1}>
              <Typography variant="body1">Work:</Typography>
              <FormControl fullWidth variant="outlined">
                <Select
                  size="small"
                  name="work"
                  onChange={handleWorkChange}
                  value={selectedWork}
                >
                  <MenuItem value="">
                    <em>None</em>
                  </MenuItem>
                  {works?.map((data) => (
                    <MenuItem key={data.name} value={data.name}>
                      {data.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Typography variant="body1" mt={1}>
                Remarks :
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={2}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </Box>
            <DialogActions
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Button
                variant="contained"
                color={!sendLoading ? 'primary' : 'inherit'}
                sx={{ width: '100px' }}
                onClick={() => {
                  sendToClerk(data?.processWorkFlow);
                }}
              >
                {!sendLoading ? (
                  'SEND'
                ) : (
                  <CircularProgress size={20}></CircularProgress>
                )}
              </Button>
              <Button
                variant="contained"
                color="error"
                onClick={() => setSendToClerkMenu(false)}
                disabled={sendLoading}
                sx={{ width: '100px' }}
              >
                Cancel
              </Button>
            </DialogActions>
          </Dialog>
          {fileView && (
            <ViewFile
              docu={fileView}
              setFileView={setFileView}
              handleViewClose={handleViewClose}
            />
          )}
        </Stack>
      )}
    </>
  );
}
