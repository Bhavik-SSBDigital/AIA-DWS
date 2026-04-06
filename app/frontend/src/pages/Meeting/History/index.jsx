import React, { useEffect, useState } from 'react';
import styles from './Schedule.module.css';
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import {
  IconCalendarPlus,
  IconClockHour5,
  IconListDetails,
  IconPhoneCall,
  IconSquareRoundedX,
  IconUser,
  IconUserCircle,
} from '@tabler/icons-react';
import Schedule from '../Schedule';
import axios from 'axios';
import { toast } from 'react-toastify';
import MeetingDetailsDialog from '../MeetingDetails';
import ListSkeleton from '../../../common/Skeletons/ListSkeleton';

export default function History({ joinMeet }) {
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const token = sessionStorage.getItem('accessToken');
  const [meetings, setMeetings] = useState([]);
  const [selectedTab, setSelectedTab] = useState('upcoming');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  // meeting details dialog
  const [meetingId, setMeetingId] = useState(null);
  const [openIndex, setOpenIndex] = useState(null);
  const [openMeetingDetails, setOpenMeetingDetails] = useState(false);

  const handleOpenMeetingDetails = (id) => {
    setOpenMeetingDetails(true);
    setMeetingId(id);
  };

  const handleCloseMeetingDetails = () => {
    setOpenMeetingDetails(false);
    setMeetingId(null);
  };

  const randomColor = (name) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash += name.charCodeAt(i);
    }

    const hue = hash % 360;
    const saturation = 70;
    const lightness = 50;

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  };

  const getHistory = async () => {
    try {
      const url = backendUrl + '/getMeetingsForUser';
      const res = await axios({
        method: 'get',
        url: url,
        headers: { Authorization: `Bearer ${token}` },
      });
      setMeetings(res.data.meetings || []);
    } catch (error) {
      // console.log(error?.response?.data?.message || error?.message);
    } finally {
      setLoading(false);
    }
  };
  const joinMeeting = async (meetingId) => {
    const url = backendUrl + `/isUserAnAttendee/${meetingId}`;
    try {
      const res = await axios({
        method: 'get',
        url: url,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.isUserAnAttendee) {
        joinMeet(meetingId);
      } else {
        toast.info('You are not an attendee');
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message);
    }
  };
  useEffect(() => {
    getHistory();
  }, []);
  return (
    <>
      <div className={styles.container}>
        <Stack
          justifyContent={{ xs: 'center', sm: 'space-between' }}
          flexDirection={'row'}
          flexWrap={'wrap'}
          gap={1}
        >
          <Stack
            gap={1}
            sx={{
              bgcolor: '#EEEEEE',
              p: 0.6,
              borderRadius: '8px',
            }}
            flexDirection={'row'}
          >
            <div
              onClick={() => setSelectedTab('past')}
              className={`${styles.tab} ${
                selectedTab == 'past' && styles.selectedTab
              }`}
            >
              <Typography variant="body1" color="initial" textAlign={'center'}>
                Past
              </Typography>
            </div>
            <div
              onClick={() => setSelectedTab('upcoming')}
              className={`${styles.tab} ${
                selectedTab == 'upcoming' && styles.selectedTab
              }`}
            >
              <Typography variant="body1" color="initial" textAlign={'center'}>
                Upcoming
              </Typography>
            </div>
          </Stack>
          <Button
            startIcon={<IconCalendarPlus />}
            onClick={handleOpen}
            variant="contained"
            sx={{ width: 220 }}
          >
            Schedule Meeting
          </Button>
        </Stack>
        {loading ? (
          <Box p={1}>
            <ListSkeleton />
          </Box>
        ) : meetings.length ? (
          meetings
            .filter((meeting) =>
              meeting.scheduledMeetings.some((item) =>
                selectedTab === 'past' ? item.meetingEnded : !item.meetingEnded,
              ),
            )
            .map((meeting, index) => (
              <div className={styles.meetingContainer} key={index}>
                <div className={styles.dateContainer}>
                  <Typography variant="h6" fontWeight={600}>
                    {meeting.date}
                  </Typography>
                  <Typography>{meeting.day}</Typography>
                </div>
                <div className={styles.meetingCardContainer}>
                  {meeting.scheduledMeetings
                    .filter((item) =>
                      selectedTab === 'past'
                        ? item.meetingEnded
                        : !item.meetingEnded,
                    )
                    .map((item, idx) => (
                      <div className={styles.meetingCard} key={idx}>
                        <div
                          className={styles.highlight}
                          style={{ backgroundColor: randomColor(item.name) }}
                        ></div>
                        <div className={styles.detailsContainer}>
                          <Typography variant="h5">{item.name}</Typography>
                          <div className={styles.details}>
                            <Typography
                              variant="subtitle1"
                              className={styles.info}
                            >
                              <strong>Host :</strong>
                              {item.host}
                            </Typography>
                            <Typography
                              variant="subtitle1"
                              className={styles.info}
                            >
                              <strong>Time :</strong>
                              {item.time}
                            </Typography>
                            <Typography
                              variant="subtitle1"
                              className={styles.info}
                            >
                              <strong>Duration :</strong>
                              {item.duration}
                            </Typography>
                            <Typography
                              variant="subtitle1"
                              className={styles.info}
                            >
                              <strong>Description :</strong>
                              {item.agenda}
                            </Typography>
                          </div>
                        </div>
                        <Stack
                          sx={{
                            marginLeft: 'auto',
                            gap: 1,
                            minWidth: 'fit-content',
                            flexDirection: 'row',
                            flexWrap: 'wrap',
                          }}
                        >
                          {selectedTab !== 'past' ||
                          item.anyParticipantInMeeting ? (
                            <Button
                              sx={{ width: 'fit-content' }}
                              startIcon={<IconPhoneCall />}
                              color="secondary"
                              onClick={() => joinMeeting(item.meetingId)}
                            >
                              JOIN
                            </Button>
                          ) : null}
                          <Button
                            startIcon={<IconListDetails />}
                            sx={{ width: 'fit-content' }}
                            color="info"
                            onClick={() =>
                              handleOpenMeetingDetails(item.meetingId)
                            }
                          >
                            Meeting Details
                          </Button>
                        </Stack>
                      </div>
                    ))}
                </div>
              </div>
            ))
        ) : (
          <div className={styles.noHistory}>
            <Typography variant="h6">No scheduled meetings</Typography>
          </div>
        )}
      </div>
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>
          Schedule Meeting
          <IconButton
            aria-label="close"
            onClick={handleClose}
            style={{ position: 'absolute', right: 8, top: 8 }}
          >
            <IconSquareRoundedX />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Schedule
            handleClose={handleClose}
            setMeetings={setMeetings}
            meetings={meetings}
          />
        </DialogContent>
      </Dialog>

      {/* meeting details dialog */}
      <MeetingDetailsDialog
        open={openMeetingDetails}
        setOpen={setOpenMeetingDetails}
        meetingId={meetingId}
        onClose={handleCloseMeetingDetails}
        id={meetingId}
      />
    </>
  );
}
