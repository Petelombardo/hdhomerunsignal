import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  LinearProgress,
  Grid,
  Chip,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  Badge,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  Radio as TuneIcon,
  SkipPrevious,
  SkipNext,
  Input as InputIcon,
  ExpandMore as ExpandMoreIcon,
  Tv as TvIcon,
  Stop as StopIcon,
  PowerOff as PowerOffIcon,
  GetApp as InstallIcon
} from '@mui/icons-material';
import axios from 'axios';
import io from 'socket.io-client';

const CHANNEL_MAPS = [
  { value: 'us-bcast', label: 'US Broadcast' },
  { value: 'us-cable', label: 'US Cable' },
  { value: 'us-hrc', label: 'US HRC' },
  { value: 'us-irc', label: 'US IRC' }
];

// Convert frequency (in Hz) to broadcast channel number
function frequencyToChannel(freqHz) {
  const freqMhz = freqHz / 1000000;

  // VHF Low (channels 2-6): 54-88 MHz
  if (freqMhz >= 54 && freqMhz <= 88) {
    // Channel 2: 57 MHz center, Channel 3: 63, Channel 4: 69, Channel 5: 79, Channel 6: 85
    const vhfLowChannels = [
      { ch: 2, freq: 57 }, { ch: 3, freq: 63 }, { ch: 4, freq: 69 },
      { ch: 5, freq: 79 }, { ch: 6, freq: 85 }
    ];
    let closest = vhfLowChannels[0];
    let minDiff = Math.abs(freqMhz - closest.freq);
    for (const ch of vhfLowChannels) {
      const diff = Math.abs(freqMhz - ch.freq);
      if (diff < minDiff) {
        minDiff = diff;
        closest = ch;
      }
    }
    return closest.ch;
  }

  // VHF High (channels 7-13): 174-216 MHz
  if (freqMhz >= 174 && freqMhz <= 216) {
    // Channel 7: 177 MHz center, then +6 MHz for each channel
    const channel = Math.round((freqMhz - 177) / 6) + 7;
    return Math.max(7, Math.min(13, channel));
  }

  // UHF (channels 14-36): 470-608 MHz (post-repack)
  if (freqMhz >= 470 && freqMhz <= 608) {
    // Channel 14: 473 MHz center, then +6 MHz for each channel
    const channel = Math.round((freqMhz - 473) / 6) + 14;
    return Math.max(14, Math.min(36, channel));
  }

  return null; // Unknown frequency range
}

function SignalMeter() {
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [selectedTuner, setSelectedTuner] = useState(0);
  const [channelMap, setChannelMap] = useState('us-bcast');
  const [selectedChannel, setSelectedChannel] = useState('');
  const [tunerStatus, setTunerStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [socket, setSocket] = useState(null);
  const [directChannel, setDirectChannel] = useState('');
  const [currentChannelPrograms, setCurrentChannelPrograms] = useState([]);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [plpInfo, setPlpInfo] = useState(null);
  const [l1Info, setL1Info] = useState(null);
  const [isAtsc3Channel, setIsAtsc3Channel] = useState(false);

  // Refs to track current device/tuner for reconnection
  const selectedDeviceRef = React.useRef(selectedDevice);
  const selectedTunerRef = React.useRef(selectedTuner);

  // Keep refs in sync with state
  React.useEffect(() => {
    selectedDeviceRef.current = selectedDevice;
  }, [selectedDevice]);

  React.useEffect(() => {
    selectedTunerRef.current = selectedTuner;
  }, [selectedTuner]);

  useEffect(() => {
    discoverDevices();
    const newSocket = io({
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });
    setSocket(newSocket);

    newSocket.on('tuner-status', (status) => {
      setTunerStatus(status);

      // Auto-detect ATSC 3.0 based on presence of PLP data
      const hasAtsc3Data = status.plpInfo && Object.keys(status.plpInfo).length > 0;
      setIsAtsc3Channel(hasAtsc3Data);

      if (status.plpInfo) {
        setPlpInfo(status.plpInfo);
      } else {
        setPlpInfo(null);
      }

      if (status.l1Info) {
        setL1Info(status.l1Info);
      } else {
        setL1Info(null);
      }
    });

    // Handle socket connection/reconnection
    let hasConnectedOnce = false;

    newSocket.on('connect', () => {
      if (hasConnectedOnce) {
        console.log('Socket reconnected - restarting monitoring');
        // On reconnect, restart monitoring if we have a device selected
        if (selectedDeviceRef.current) {
          // Add small delay to ensure socket is fully ready
          setTimeout(() => {
            console.log('Emitting start-monitoring for device:', selectedDeviceRef.current, 'tuner:', selectedTunerRef.current);
            newSocket.emit('start-monitoring', {
              deviceId: selectedDeviceRef.current,
              tuner: selectedTunerRef.current
            });
          }, 100);
        } else {
          console.log('No device selected, skipping monitoring restart');
        }
      } else {
        console.log('Socket connected (initial)');
        hasConnectedOnce = true;
        // Don't start monitoring here - let the useEffect handle it
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    newSocket.on('connect_error', (error) => {
      console.log('Socket connection error:', error.message);
    });

    newSocket.on('reconnect_attempt', (attemptNumber) => {
      console.log('Reconnection attempt:', attemptNumber);
    });

    newSocket.on('reconnect_error', (error) => {
      console.log('Reconnection error:', error.message);
    });

    newSocket.on('reconnect_failed', () => {
      console.log('Reconnection failed - gave up');
    });

    // PWA install prompt handling
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallButton(true);
    };

    const handleAppInstalled = () => {
      setShowInstallButton(false);
      setDeferredPrompt(null);
    };

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setShowInstallButton(false);
    } else {
      setShowInstallButton(true);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      newSocket.close();
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (selectedDevice && socket) {
      console.log('useEffect: Starting monitoring for device:', selectedDevice, 'tuner:', selectedTuner);
      socket.emit('start-monitoring', {
        deviceId: selectedDevice,
        tuner: selectedTuner
      });
    }
    return () => {
      if (socket) {
        console.log('useEffect cleanup: Stopping monitoring');
        socket.emit('stop-monitoring');
      }
    };
  }, [selectedDevice, selectedTuner, socket]);

  // Update directChannel input field when tuner status changes
  useEffect(() => {
    if (tunerStatus?.channel) {
      if (tunerStatus.channel === 'none') {
        // Tuner is cleared/stopped
        setDirectChannel('');
        setCurrentChannelPrograms([]);
      } else {
        // Check if format includes frequency (e.g., "auto6t:605028615")
        const freqMatch = tunerStatus.channel.match(/:(\d{8,})/);
        if (freqMatch) {
          // Has frequency - convert to channel number
          const freqHz = parseInt(freqMatch[1]);
          const channel = frequencyToChannel(freqHz);
          if (channel) {
            console.log(`Converted frequency ${freqHz} Hz to channel ${channel}`);
            setDirectChannel(channel.toString());
          }
        } else {
          // Standard format (e.g., "auto:4" -> "4", "13" -> "13")
          const channelMatch = tunerStatus.channel.match(/(?:auto:)?(\d+)/);
          if (channelMatch) {
            setDirectChannel(channelMatch[1]);
          }
        }
      }
    }
  }, [tunerStatus?.channel]);

  // Auto-fetch programs when channel is already tuned on initial load or after tuner change
  useEffect(() => {
    if (tunerStatus?.lock &&
        tunerStatus.channel &&
        tunerStatus.channel !== 'none' &&
        currentChannelPrograms.length === 0 &&
        selectedDevice) {
      // Channel is tuned but we don't have program info yet - fetch it
      console.log('Auto-fetching programs for tuner', selectedTuner);
      getCurrentChannelPrograms();
    }
  }, [tunerStatus?.lock, tunerStatus?.channel, selectedDevice, selectedTuner]);

  // Clear all data when tuner changes
  useEffect(() => {
    console.log('Tuner changed to:', selectedTuner, '- clearing old channel data');
    setCurrentChannelPrograms([]);
    setPlpInfo(null);
    setL1Info(null);
    setIsAtsc3Channel(false);
    setDirectChannel('');
    // Note: monitoring will restart via the monitoring useEffect, and
    // the auto-fetch useEffect will repopulate data for the new tuner
  }, [selectedTuner]);

  const discoverDevices = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/devices');
      setDevices(response.data);
      if (response.data.length > 0) {
        setSelectedDevice(response.data[0].id);
        await getDeviceInfo(response.data[0].id);
      }
    } catch (error) {
      console.error('Failed to discover devices:', error);
    }
    setLoading(false);
  };

  const getDeviceInfo = async (deviceId) => {
    try {
      const response = await axios.get(`/api/devices/${deviceId}/info`);
      console.log('Device info received:', response.data);
      setDeviceInfo(response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to get device info:', error);
      return null;
    }
  };



  const tuneToDirectChannel = async (channel) => {
    if (!selectedDevice || !channel) return;

    try {
      // Clear old data immediately when changing channels
      setCurrentChannelPrograms([]);
      setPlpInfo(null);
      setL1Info(null);
      setIsAtsc3Channel(false);

      // Use regular tuning - let backend auto-detect ATSC 3.0
      await axios.post(`/api/devices/${selectedDevice}/tuner/${selectedTuner}/channel`, {
        channel
      });

      setSelectedChannel(channel);
      // Don't clear directChannel - it will be updated by the useEffect when tuner status updates

      // Wait for tuner to lock with progressive delays
      const waitAndGetPrograms = async () => {
        // Initial wait
        await new Promise(resolve => setTimeout(resolve, 2000));
        await getCurrentChannelPrograms();

        // Try again after longer delay for slow-locking channels
        setTimeout(async () => {
          const response = await axios.get(`/api/devices/${selectedDevice}/tuner/${selectedTuner}/programs`);
          if (response.data.length > currentChannelPrograms.length) {
            setCurrentChannelPrograms(response.data);
          }
        }, 4000);
      };

      waitAndGetPrograms();
    } catch (error) {
      console.error('Failed to set channel:', error);
    }
  };

  const getCurrentChannelPrograms = async () => {
    if (!selectedDevice) return;
    
    try {
      const response = await axios.get(`/api/devices/${selectedDevice}/tuner/${selectedTuner}/programs`);
      setCurrentChannelPrograms(response.data);
    } catch (error) {
      console.error('Failed to get current channel programs:', error);
      setCurrentChannelPrograms([]);
    }
  };

  const incrementChannel = async () => {
    if (!selectedDevice) return;

    // Clear old data immediately
    setCurrentChannelPrograms([]);
    setPlpInfo(null);
    setL1Info(null);
    setIsAtsc3Channel(false);

    // Use the tracked directChannel state or extract from tuner status as fallback
    let currentChannelNum = parseInt(directChannel) || 1;

    // If directChannel is empty or invalid, try to extract from tuner status
    if (!currentChannelNum && tunerStatus?.channel) {
      // Check for frequency format first
      const freqMatch = tunerStatus.channel.match(/:(\d{8,})/);
      if (freqMatch) {
        const freqHz = parseInt(freqMatch[1]);
        currentChannelNum = frequencyToChannel(freqHz) || 1;
      } else {
        const channelMatch = tunerStatus.channel.match(/(?:auto:)?(\d+)/);
        currentChannelNum = channelMatch ? parseInt(channelMatch[1]) : 1;
      }
    }

    const nextChannel = Math.min(36, currentChannelNum + 1);

    try {
      await tuneToDirectChannel(nextChannel.toString());
    } catch (error) {
      console.error('Failed to increment channel:', error);
    }
  };

  const decrementChannel = async () => {
    if (!selectedDevice) return;

    // Clear old data immediately
    setCurrentChannelPrograms([]);
    setPlpInfo(null);
    setL1Info(null);
    setIsAtsc3Channel(false);

    // Use the tracked directChannel state or extract from tuner status as fallback
    let currentChannelNum = parseInt(directChannel) || 1;

    // If directChannel is empty or invalid, try to extract from tuner status
    if (!currentChannelNum && tunerStatus?.channel) {
      // Check for frequency format first
      const freqMatch = tunerStatus.channel.match(/:(\d{8,})/);
      if (freqMatch) {
        const freqHz = parseInt(freqMatch[1]);
        currentChannelNum = frequencyToChannel(freqHz) || 1;
      } else {
        const channelMatch = tunerStatus.channel.match(/(?:auto:)?(\d+)/);
        currentChannelNum = channelMatch ? parseInt(channelMatch[1]) : 1;
      }
    }

    const prevChannel = Math.max(1, currentChannelNum - 1);

    try {
      await tuneToDirectChannel(prevChannel.toString());
    } catch (error) {
      console.error('Failed to decrement channel:', error);
    }
  };

  const clearTuner = async () => {
    if (!selectedDevice) return;
    
    try {
      // Clear all data immediately
      setDirectChannel('');
      setCurrentChannelPrograms([]);
      setPlpInfo(null);
      setL1Info(null);
      setIsAtsc3Channel(false);
      
      await axios.post(`/api/devices/${selectedDevice}/tuner/${selectedTuner}/clear`);
    } catch (error) {
      console.error('Failed to clear tuner:', error);
    }
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      setDeferredPrompt(null);
      setShowInstallButton(false);
    }
  };

  const getSignalColor = (value) => {
    if (value >= 80) return '#4CAF50';
    if (value >= 60) return '#FF9800';
    return '#F44336';
  };

  const formatDataRate = (bps) => {
    if (!bps) return '0.000 Mbps';
    return (bps / 1000000).toFixed(3) + ' Mbps';
  };

  return (
    <Box>
      <Grid container spacing={1}>
        {/* Device Selection */}
        <Grid item xs={12}>
          <Card>
            <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <FormControl sx={{ minWidth: 180, flex: 1 }} size="small">
                  <InputLabel>Device</InputLabel>
                  <Select
                    value={selectedDevice}
                    label="Device"
                    onChange={async (e) => {
                      const newDeviceId = e.target.value;
                      setSelectedDevice(newDeviceId);

                      // Clear old channel data when switching devices
                      setCurrentChannelPrograms([]);
                      setPlpInfo(null);
                      setL1Info(null);
                      setIsAtsc3Channel(false);
                      setDirectChannel('');

                      // Get info for new device and adjust tuner if needed
                      const info = await getDeviceInfo(newDeviceId);
                      if (info && selectedTuner >= info.tuners) {
                        // Current tuner doesn't exist on new device - switch to highest tuner
                        setSelectedTuner(info.tuners - 1);
                      }
                    }}
                  >
                    {devices.map((device) => (
                      <MenuItem key={device.id} value={device.id}>
                        {device.id}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="outlined"
                  onClick={discoverDevices}
                  disabled={loading}
                  sx={{ minWidth: 'auto', px: 1 }}
                  size="small"
                >
                  <RefreshIcon />
                </Button>
                {showInstallButton && (
                  <Button
                    variant="contained"
                    onClick={handleInstallClick}
                    color="primary"
                    sx={{ minWidth: 'auto', px: 1 }}
                    size="small"
                  >
                    <InstallIcon />
                  </Button>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Signal Display */}
        {selectedDevice && (
          <Grid item xs={12}>
            <Card>
              <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                {/* Channel Info and Controls */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
                  <Typography variant="h6" sx={{ fontSize: '1.1rem', minWidth: 'fit-content' }}>
                    {!tunerStatus?.channel || tunerStatus.channel === 'none' ? 'Stopped' : tunerStatus.channel}
                  </Typography>
                  
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                    <TextField
                      label="CH"
                      variant="outlined"
                      size="small"
                      value={directChannel}
                      onChange={(e) => setDirectChannel(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          tuneToDirectChannel(directChannel);
                        }
                      }}
                      placeholder="36"
                      sx={{ 
                        width: 60,
                        '& .MuiOutlinedInput-root': {
                          paddingLeft: 0,
                          paddingRight: 0,
                        },
                        '& .MuiOutlinedInput-input': {
                          padding: '6px 4px',
                          textAlign: 'center',
                          fontSize: '14px'
                        }
                      }}
                      disabled={!selectedDevice}
                      inputProps={{ maxLength: 2 }}
                    />
                    <Button variant="contained" onClick={() => tuneToDirectChannel(directChannel)} disabled={!selectedDevice || !directChannel} size="small" sx={{ minWidth: 'auto', px: 1 }}>
                      <TuneIcon />
                    </Button>
                    <Button variant="outlined" onClick={decrementChannel} disabled={!selectedDevice} size="small" sx={{ minWidth: 'auto', px: 1 }}>
                      <SkipPrevious />
                    </Button>
                    <Button variant="outlined" onClick={incrementChannel} disabled={!selectedDevice} size="small" sx={{ minWidth: 'auto', px: 1 }}>
                      <SkipNext />
                    </Button>
                    <Button variant="contained" color="error" onClick={clearTuner} disabled={!selectedDevice || tunerStatus?.channel === 'none'} size="small" sx={{ minWidth: 'auto', px: 1 }}>
                      <StopIcon />
                    </Button>
                  </Box>
                </Box>
                
                {/* Compact Signal Display */}
                {tunerStatus?.lock ? (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                    <Box sx={{ flex: '1 1 120px', minWidth: 120 }}>
                      <Typography variant="body2" sx={{ fontSize: '0.75rem', mb: 0.5 }}>
                        Signal: {tunerStatus.ss || 0}%
                        {tunerStatus.ssDb && <span style={{ fontSize: '0.65rem', opacity: 0.8 }}> (~{tunerStatus.ssDb}dBm)</span>}
                      </Typography>
                      <LinearProgress variant="determinate" value={tunerStatus.ss || 0} sx={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', '& .MuiLinearProgress-bar': { backgroundColor: getSignalColor(tunerStatus.ss || 0) } }} />
                    </Box>
                    <Box sx={{ flex: '1 1 120px', minWidth: 120 }}>
                      <Typography variant="body2" sx={{ fontSize: '0.75rem', mb: 0.5 }}>
                        SNR: {tunerStatus.snq || 0}%
                        {tunerStatus.snrDb && tunerStatus.snrDb > 0 && <span style={{ fontSize: '0.65rem', opacity: 0.8 }}> (~{tunerStatus.snrDb}dB)</span>}
                      </Typography>
                      <LinearProgress variant="determinate" value={tunerStatus.snq || 0} sx={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', '& .MuiLinearProgress-bar': { backgroundColor: getSignalColor(tunerStatus.snq || 0) } }} />
                    </Box>
                    <Box sx={{ flex: '1 1 120px', minWidth: 120 }}>
                      <Typography variant="body2" sx={{ fontSize: '0.75rem', mb: 0.5 }}>Sym: {tunerStatus.seq || 0}%</Typography>
                      <LinearProgress variant="determinate" value={tunerStatus.seq || 0} sx={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', '& .MuiLinearProgress-bar': { backgroundColor: getSignalColor(tunerStatus.seq || 0) } }} />
                    </Box>
                    <Box sx={{ flex: '1 1 100px', minWidth: 100, textAlign: 'right' }}>
                      <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>Rate</Typography>
                      <Typography variant="body1" sx={{ fontSize: '0.9rem', fontWeight: 500 }}>{formatDataRate(tunerStatus.bps)}</Typography>
                    </Box>
                  </Box>
                ) : (
                  <Typography variant="body2" sx={{ textAlign: 'center', py: 1, color: 'text.secondary' }}>
                    No signal detected
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Controls */}
        {selectedDevice && (
          <Grid item xs={12}>
            <Card>
              <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <FormControl sx={{ minWidth: 140, flex: 1 }} size="small">
                    <InputLabel>Channel Map</InputLabel>
                    <Select
                      value={channelMap}
                      label="Channel Map"
                      onChange={(e) => setChannelMap(e.target.value)}
                    >
                      {CHANNEL_MAPS.map((map) => (
                        <MenuItem key={map.value} value={map.value}>
                          {map.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {deviceInfo && (
                    <FormControl sx={{ minWidth: 100 }} size="small">
                      <InputLabel>Tuner</InputLabel>
                      <Select
                        value={selectedTuner}
                        label="Tuner"
                        onChange={(e) => setSelectedTuner(e.target.value)}
                      >
                        {Array.from({ length: deviceInfo.tuners }, (_, i) => (
                          <MenuItem key={i} value={i}>
                            Tuner {i}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* ATSC 3.0 Status Indicator */}
        {selectedDevice && isAtsc3Channel && (
          <Grid item xs={12}>
            <Card>
              <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Chip 
                    label="ATSC 3.0 Channel Detected" 
                    color="success" 
                    variant="outlined"
                    size="small"
                    sx={{ fontWeight: 600 }}
                  />
                  <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                    NextGen TV signal with enhanced data available
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* PLP Information */}
        {selectedDevice && plpInfo && (
          <Grid item xs={12}>
            <Card>
              <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                <Typography variant="body1" sx={{ fontSize: '0.9rem', mb: 1, fontWeight: 500 }}>
                  ATSC 3.0 PLP Information
                </Typography>
                <TableContainer component={Paper} sx={{ backgroundColor: 'transparent', boxShadow: 'none' }}>
                  <Table size="small" sx={{ '& .MuiTableCell-root': { py: 0.5, fontSize: '0.8rem' } }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>PLP</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Modulation</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Code Rate</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Layer</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Time Interleaving</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>LLS</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Lock</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(plpInfo).map(([plpId, info]) => (
                        <TableRow key={plpId}>
                          <TableCell>
                            <Chip 
                              label={plpId} 
                              size="small" 
                              color="primary" 
                              variant="outlined"
                              sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                          </TableCell>
                          <TableCell>{info.modulation || 'N/A'}</TableCell>
                          <TableCell>{info.coderate || 'N/A'}</TableCell>
                          <TableCell>{info.layer || 'N/A'}</TableCell>
                          <TableCell>{info.timeInterleaving || 'N/A'}</TableCell>
                          <TableCell>
                            <Chip 
                              label={info.lls ? 'Yes' : 'No'} 
                              size="small" 
                              color={info.lls ? 'success' : 'default'}
                              sx={{ height: 18, fontSize: '0.65rem' }}
                            />
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={info.lock ? 'Locked' : 'Unlocked'} 
                              size="small" 
                              color={info.lock ? 'success' : 'error'}
                              sx={{ height: 18, fontSize: '0.65rem' }}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* L1 Information */}
        {selectedDevice && l1Info && (
          <Grid item xs={12}>
            <Card>
              <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                <Typography variant="body1" sx={{ fontSize: '0.9rem', mb: 1, fontWeight: 500 }}>
                  ATSC 3.0 L1 Information
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 1 }}>
                  {Object.entries(l1Info).map(([key, value]) => (
                    <Box key={key} sx={{ display: 'flex', justifyContent: 'space-between', p: 0.5, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 1 }}>
                      <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 500 }}>
                        {key.replace(/_/g, ' ').toUpperCase()}:
                      </Typography>
                      <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                        {value}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Current Channel Programs */}
        {selectedDevice && currentChannelPrograms.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                <Typography variant="body1" sx={{ fontSize: '0.9rem', mb: 1, fontWeight: 500 }}>
                  Programs on Channel {tunerStatus?.channel?.split(':')[0] || 'Unknown'}
                </Typography>
                <TableContainer component={Paper} sx={{ backgroundColor: 'transparent', boxShadow: 'none' }}>
                  <Table size="small" sx={{ '& .MuiTableCell-root': { py: 0.5, fontSize: '0.8rem' } }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>PID</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Virtual</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Call Sign</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {currentChannelPrograms.map((program, index) => (
                        <TableRow key={index}>
                          <TableCell>{program.programNum}</TableCell>
                          <TableCell>
                            <Chip 
                              label={program.virtualChannel} 
                              size="small" 
                              color="primary" 
                              variant="outlined"
                              sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                          </TableCell>
                          <TableCell>{program.callsign}</TableCell>
                          <TableCell>
                            {program.encrypted && (
                              <Chip label="Encrypted" size="small" color="warning" sx={{ height: 18, fontSize: '0.65rem' }} />
                            )}
                            {program.status && !program.encrypted && (
                              <Chip label={program.status} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => tuneToDirectChannel(`${tunerStatus?.channel?.split(':')[0]}:${program.programNum}`)}
                              sx={{ minWidth: 'auto', px: 1, py: 0.25, fontSize: '0.7rem' }}
                            >
                              Tune
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

    </Box>
  );
}

export default SignalMeter;