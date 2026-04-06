import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  Chip,
  Stack,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Divider,
  TextField,
  CircularProgress,
  Skeleton,
  ListItemButton,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import VideocamIcon from '@mui/icons-material/Videocam';
import MicIcon from '@mui/icons-material/Mic';
import CloseIcon from '@mui/icons-material/Close';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useForm } from 'react-hook-form';
import Loader from '../../../common/Loader';
import FormSkeleton from '../../../common/Skeletons/FormSkeleton';
import { useNavigate } from 'react-router-dom';
import {
  download,
  upload,
} from '../../../components/drop-file-input/FileUploadDownload';
import View from '../../../pages/view/View';

const MeetingDetailsDialog = ({ open, setOpen, onClose, id }) => {
  const {
    handleSubmit,
    register,
    reset,
    formState: { errors, isSubmitting },
  } = useForm();

  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const [loading, setLoading] = useState(true);
  const username = sessionStorage.getItem('username');
  const token = sessionStorage.getItem('accessToken');
  const [meetingDetails, setMeetingDetails] = useState({});
  const isInitiator = sessionStorage.getItem('initiator') == 'true';
  const formatDateTime = (dateString) => new Date(dateString).toLocaleString();

  const getDetails = async () => {
    setLoading(true);
    const url = backendUrl + `/getMeetingDetails/${id}`;
    try {
      const res = await axios({
        method: 'get',
        url: url,
        headers: { Authorization: `Bearer ${token}` },
      });
      setMeetingDetails(res.data.meetingDetails || {});
    } catch (error) {
      // console.log(error?.response?.data?.message || error?.message);
    } finally {
      setLoading(false);
    }
  };
  const postComment = async (data) => {
    const url = backendUrl + '/addCommentInMeeting';
    const formData = { comment: data.comment, meetingId: id };
    try {
      const res = await axios({
        method: 'post',
        url: url,
        data: formData,
        headers: { Authorization: `Bearer ${token}` },
      });
      setMeetingDetails((prev) => ({
        ...prev,
        comments: [
          ...prev.comments,
          {
            commentor: username,
            comment: data.comment,
            timestamp: new Date().toISOString(),
          },
        ],
      }));
      reset();
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    }
  };
  useEffect(() => {
    setMeetingDetails({});
    if (id) {
      getDetails();
    }
  }, [id]);
  const navigate = useNavigate();
  const handleInitiate = () => {
    const url = `/processes/initiate?meetingId=${id}`;
    navigate(url);
  };
  const handleViewTimeline = (process) => {
    const url = `/dashboard/timeLine?data=${process}`;
    navigate(url);
  };

  // minutes of meeting
  const fileInputRef = useRef(null); // Create file input ref
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };
  const handleUploadMoM = async (event) => {
    event.preventDefault();

    if (!selectedFile) {
      toast.warn('Please select a file before uploading.');
      return;
    }

    setIsUploading(true);

    try {
      // Extract file name and extension
      const fileName = selectedFile.name.split('.').slice(0, -1).join('.');
      const fileExt = selectedFile.name.split('.').pop();

      // Prepare form data for upload
      const formData = new FormData();
      formData.append('file', selectedFile);

      // Simulate file upload
      const uploadResult = await upload(
        [selectedFile],
        '../moms',
        () => {}, // Dummy callback
        `${fileName}.${fileExt}`,
        true,
      );

      if (!uploadResult?.[0]) {
        throw new Error('File upload failed. Please try again.');
      }

      const docId = uploadResult[0];

      // API request to link uploaded file with meeting
      const response = await axios.post(
        backendUrl + '/uploadMomInMeet',
        {
          meetingId: id,
          mom: docId,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (response.status !== 200) {
        throw new Error('Failed to save uploaded file. Please try again.');
      }

      // Update meeting details state with new MOM
      setMeetingDetails((prevDetails) => ({
        ...prevDetails,
        mom: {
          name: `${fileName}.${fileExt}`,
          path: `../moms`,
          docId: docId,
        },
      }));

      fileInputRef.current.value = ''; // Clear file input
      toast.success('File uploaded successfully!');
      setSelectedFile(null);
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error(
        error?.response?.data?.message ||
          error.message ||
          'An unexpected error occurred.',
      );
    } finally {
      setIsUploading(false);
    }
  };
  const [viewFileDetails, setViewFileDetails] = useState();
  const handleViewClose = () => {
    setViewFileDetails();
  };
  const handleView = async (path, name, id) => {
    try {
      const fileData = await download(name, path, true);
      if (fileData) {
        setViewFileDetails({
          url: fileData.data,
          type: fileData.fileType,
          fileId: id,
        });
      } else {
        toast.error('Invalid file data.');
      }
    } catch (error) {
      toast.error('Unable to view the file.');
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>
          {meetingDetails?.title ? meetingDetails?.title : '---'}
          <IconButton
            aria-label="close"
            onClick={onClose}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
              color: (theme) => theme.palette.grey[500],
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {loading ? (
            <FormSkeleton />
          ) : (
            <Box sx={{ p: 1 }}>
              <Stack
                flexDirection={'row'}
                flexWrap={'wrap'}
                gap={1}
                justifyContent="space-between"
                mb={3}
              >
                <Box>
                  <Typography variant="subtitle1" color="textSecondary">
                    Agenda
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 4 }}>
                    {meetingDetails?.agenda ? meetingDetails?.agenda : '---'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle1" color="textSecondary">
                    Meeting Time
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 4 }}>
                    <AccessTimeIcon
                      fontSize="small"
                      sx={{ verticalAlign: 'middle', mr: 0.5 }}
                    />
                    {meetingDetails?.startTime
                      ? formatDateTime(meetingDetails?.startTime)
                      : null}
                    -
                    {meetingDetails?.endTime
                      ? formatDateTime(meetingDetails?.endTime)
                      : null}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="subtitle1" color="textSecondary">
                    Created By
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 4 }}>
                    <AccountCircleOutlinedIcon
                      fontSize="small"
                      sx={{ verticalAlign: 'middle', mr: 0.5 }}
                    />
                    {meetingDetails?.createdBy}
                  </Typography>
                </Box>
              </Stack>
              <Stack gap={5}>
                <Box
                  sx={{
                    p: 2,
                    borderRadius: '8px',
                    boxShadow: 'rgba(0, 0, 0, 0.16) 0px 1px 4px',
                  }}
                >
                  <Typography variant="h6" gutterBottom>
                    Attendees :
                  </Typography>
                  <Stack
                    direction="row"
                    spacing={1}
                    gap={1}
                    sx={{
                      flexWrap: 'wrap',
                      p: 2,
                      bgcolor: '#EEEEEE',
                      borderRadius: '8px',
                    }}
                  >
                    {meetingDetails?.attendees?.length ? (
                      meetingDetails?.attendees?.map((attendee, index) => (
                        <Chip key={index} label={attendee} color="primary" />
                      ))
                    ) : (
                      <Typography color="textSecondary" variant="body2">
                        No Attendees.
                      </Typography>
                    )}
                  </Stack>
                </Box>

                <Box
                  sx={{
                    p: 2,
                    borderRadius: '8px',
                    boxShadow: 'rgba(0, 0, 0, 0.16) 0px 1px 4px',
                  }}
                >
                  <Typography variant="h6" gutterBottom>
                    Logs :
                  </Typography>
                  <List
                    dense
                    sx={{
                      bgcolor: '#EEEEEE',
                      p: '10px',
                      borderRadius: '8px',
                      maxHeight: '350px',
                      overflow: 'auto',
                    }}
                  >
                    {meetingDetails?.logs?.length > 0 ? (
                      meetingDetails?.logs.map((log, index) => (
                        <ListItem key={index}>
                          <ListItemText
                            primary={`${
                              log.attendee
                            } joined at ${formatDateTime(log.joinedAt)}`}
                            secondary={
                              log.leftAt
                                ? `Left at ${formatDateTime(log.leftAt)}`
                                : 'Currently in meeting'
                            }
                          />
                        </ListItem>
                      ))
                    ) : (
                      <Typography color="textSecondary" variant="body2">
                        No logs available.
                      </Typography>
                    )}
                  </List>
                </Box>

                <Box
                  sx={{
                    p: 2,
                    borderRadius: '8px',
                    boxShadow: 'rgba(0, 0, 0, 0.16) 0px 1px 4px',
                  }}
                >
                  <Typography variant="h6" gutterBottom>
                    Comments :
                  </Typography>
                  <List
                    dense
                    sx={{
                      bgcolor: '#EEEEEE',
                      p: '10px',
                      mb: 1,
                      borderRadius: '8px',
                      maxHeight: '350px',
                      overflow: 'auto',
                    }}
                  >
                    {meetingDetails?.comments?.length > 0 ? (
                      meetingDetails?.comments.map((comment, index) => (
                        <ListItem key={index} alignItems="flex-start">
                          <Avatar>{comment.commentor[0]}</Avatar>
                          <Box sx={{ ml: 2 }}>
                            <Typography
                              variant="subtitle2"
                              color="textSecondary"
                            >
                              {comment.commentor} -{' '}
                              {formatDateTime(comment.timestamp)}
                            </Typography>
                            <Typography variant="body2">
                              {comment.comment}
                            </Typography>
                          </Box>
                        </ListItem>
                      ))
                    ) : (
                      <Typography color="textSecondary" variant="body2">
                        No comments yet.
                      </Typography>
                    )}
                  </List>
                  <form onSubmit={handleSubmit(postComment)}>
                    <Stack flexDirection={'row'} gap={1}>
                      <TextField
                        {...register('comment', { required: true })}
                        name="comment"
                        fullWidth
                        label="Write Comment"
                        size="small"
                      />
                      <Button variant="contained" type="submit">
                        {isSubmitting ? <CircularProgress size={22} /> : 'Post'}
                      </Button>
                    </Stack>
                  </form>
                </Box>

                <Box
                  sx={{
                    p: 2,
                    borderRadius: '8px',
                    boxShadow: 'rgba(0, 0, 0, 0.16) 0px 1px 4px',
                  }}
                >
                  <Typography variant="h6" mb={1}>
                    Associate Processes :
                  </Typography>
                  <List
                    dense
                    sx={{
                      bgcolor: '#EEEEEE',
                      p: '10px',
                      borderRadius: '8px',
                      maxHeight: '350px',
                      overflow: 'auto',
                    }}
                  >
                    {meetingDetails?.associatedProcesses?.length > 0 ? (
                      meetingDetails?.associatedProcesses?.map(
                        (process, index) => (
                          <ListItem key={index} alignItems="flex-start">
                            <ListItemText
                              sx={{ flex: 10 }}
                              primary={process?.processName}
                            />
                            <ListItemButton
                              sx={{ flex: 2, color: 'blue' }}
                              onClick={() =>
                                handleViewTimeline(process?.processName)
                              }
                            >
                              View Timeline
                            </ListItemButton>
                          </ListItem>
                        ),
                      )
                    ) : (
                      <Typography color="textSecondary" variant="body2">
                        No processes initiated yet.
                      </Typography>
                    )}
                    {isInitiator ? (
                      <>
                        <Divider sx={{ my: 1 }} />
                        <Typography
                          variant="subtitle1"
                          color="textSecondary"
                          sx={{ display: 'inline-block' }}
                        >
                          Initiate new process in context of this meeting :
                        </Typography>
                        <Button
                          variant="outlined"
                          sx={{ ml: 2, display: 'inline-block' }}
                          onClick={handleInitiate}
                        >
                          Initiate
                        </Button>
                      </>
                    ) : null}
                  </List>
                </Box>
                <Box
                  sx={{
                    p: 2,
                    borderRadius: '8px',
                    boxShadow: 'rgba(0, 0, 0, 0.16) 0px 1px 4px',
                  }}
                >
                  <Typography variant="h6" mb={1}>
                    Uploaded Recordings:
                  </Typography>
                  {meetingDetails?.associatedRecordings?.length > 0 ? (
                    <TableContainer
                      sx={{
                        border: '1px solid lightgray',
                        borderRadius: '8px',
                        maxHeight: '350px',
                        overflow: 'auto',
                      }}
                    >
                      <Table stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell>URL</TableCell>
                            <TableCell>File Type</TableCell>
                            <TableCell>Action</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {meetingDetails?.associatedRecordings?.map(
                            (recording, index) => (
                              <TableRow key={index}>
                                <TableCell>{recording?.url}</TableCell>
                                <TableCell>{recording?.fileType}</TableCell>
                                <TableCell>
                                  <Button
                                    sx={{ color: 'blue' }}
                                    onClick={() => {
                                      setViewFileDetails({
                                        url: recording?.url,
                                        type: recording?.fileType,
                                      });
                                      setOpen(false);
                                    }}
                                  >
                                    View
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ),
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : (
                    <Typography color="textSecondary" variant="body2">
                      No Recording Uploaded Yet.
                    </Typography>
                  )}
                </Box>

                {/* <Box
                  sx={{
                    p: 2,
                    borderRadius: '8px',
                    boxShadow: 'rgba(0, 0, 0, 0.16) 0px 1px 4px',
                  }}
                >
                  <Typography variant="h6" gutterBottom>
                    Minutes of Meeting (MoM) :
                  </Typography>
                  <List
                    dense
                    sx={{
                      bgcolor: '#EEEEEE',
                      p: 1,
                      borderRadius: '8px',
                      maxHeight: '350px',
                      mb: 1,
                      overflow: 'auto',
                    }}
                  >
                    {meetingDetails.mom ? (
                      <ListItem
                        sx={{
                          display: 'flex',
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 1,
                          p: 1.5,
                          bgcolor: '#FFF',
                          borderRadius: '6px',
                          boxShadow: '0px 2px 4px rgba(0,0,0,0.1)',
                        }}
                      >
                        <Box>
                          <Typography variant="subtitle1" fontWeight="bold">
                            File Name:
                          </Typography>
                          <Typography variant="body2" color="textSecondary">
                            {meetingDetails.mom.name || 'N/A'}
                          </Typography>
                        </Box>
                        <Button
                          onClick={() =>
                            handleView(
                              meetingDetails?.mom?.path,
                              meetingDetails?.mom?.name,
                              meetingDetails?.mom?.docId,
                            )
                          }
                        >
                          View
                        </Button>
                      </ListItem>
                    ) : (
                      <Typography
                        color="textSecondary"
                        variant="body2"
                        textAlign="center"
                        sx={{ mt: 2 }}
                      >
                        No Files Uploaded.
                      </Typography>
                    )}
                  </List>

                  <Box
                    component="form"
                    onSubmit={handleUploadMoM}
                    sx={{
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                    }}
                  >
                    <TextField
                      type="file"
                      fullWidth
                      ref={fileInputRef}
                      inputProps={{ accept: '.pdf,.doc,.docx,.txt' }}
                      onChange={handleFileChange}
                    />
                    <Button
                      type="submit"
                      variant="contained"
                      sx={{ height: '55px' }}
                      disabled={!selectedFile || isUploading}
                    >
                      {isUploading ? <CircularProgress size={22} /> : 'Upload'}
                    </Button>
                  </Box>
                </Box> */}
              </Stack>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>
      {viewFileDetails ? (
        <View
          docu={viewFileDetails}
          setFileView={setViewFileDetails}
          handleViewClose={handleViewClose}
        />
      ) : null}
    </>
  );
};

export default MeetingDetailsDialog;
