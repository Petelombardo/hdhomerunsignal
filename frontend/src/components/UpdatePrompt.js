import React, { useState, useEffect, useCallback } from 'react';
import { Box, Button, Typography, LinearProgress } from '@mui/material';
import { Refresh as RefreshIcon, Close as CloseIcon } from '@mui/icons-material';

const COUNTDOWN_SECONDS = 30;
const DISMISS_DURATION_MS = 5 * 60 * 1000; // 5 minutes

function UpdatePrompt({ onDismiss }) {
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [isUpdating, setIsUpdating] = useState(false);

  const performUpdate = useCallback(async () => {
    setIsUpdating(true);

    try {
      // Unregister service worker
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }

      // Clear all caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        for (const cacheName of cacheNames) {
          await caches.delete(cacheName);
        }
      }

      // Hard reload to get fresh content
      window.location.reload(true);
    } catch (error) {
      console.error('Update failed:', error);
      // Force reload anyway
      window.location.reload(true);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          performUpdate();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [performUpdate]);

  const handleDismiss = () => {
    if (onDismiss) {
      onDismiss(DISMISS_DURATION_MS);
    }
  };

  const progress = ((COUNTDOWN_SECONDS - countdown) / COUNTDOWN_SECONDS) * 100;

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: '#1976d2',
        color: 'white',
        zIndex: 9999,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      }}
    >
      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{
          height: 3,
          backgroundColor: 'rgba(255,255,255,0.3)',
          '& .MuiLinearProgress-bar': {
            backgroundColor: '#fff'
          }
        }}
      />
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="body2" sx={{ flex: 1, minWidth: 200 }}>
          {isUpdating
            ? 'Updating...'
            : `A new version is available. Updating in ${countdown}s...`
          }
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            size="small"
            onClick={performUpdate}
            disabled={isUpdating}
            startIcon={<RefreshIcon />}
            sx={{
              backgroundColor: 'rgba(255,255,255,0.2)',
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.3)' },
            }}
          >
            Update Now
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={handleDismiss}
            disabled={isUpdating}
            startIcon={<CloseIcon />}
            sx={{
              color: 'white',
              borderColor: 'rgba(255,255,255,0.5)',
              '&:hover': {
                borderColor: 'white',
                backgroundColor: 'rgba(255,255,255,0.1)'
              },
            }}
          >
            Dismiss
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

export default UpdatePrompt;
