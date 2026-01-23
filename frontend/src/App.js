import React, { useState, useEffect, useCallback } from 'react';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Container,
  AppBar,
  Toolbar,
  Typography,
  Box
} from '@mui/material';
import SignalMeter from './components/SignalMeter';
import UpdatePrompt from './components/UpdatePrompt';
import { BUILD_HASH } from './buildVersion';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#4CAF50',
    },
    secondary: {
      main: '#FF9800',
    },
    background: {
      default: '#1e1e1e',
      paper: '#2d2d2d',
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: 'linear-gradient(135deg, #2d2d2d 0%, #3d3d3d 100%)',
        },
      },
    },
  },
});

const VERSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

function App() {
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [dismissedUntil, setDismissedUntil] = useState(0);

  const checkVersion = useCallback(async () => {
    // Skip if dev version or currently dismissed
    if (BUILD_HASH === 'dev') return;
    if (Date.now() < dismissedUntil) return;

    try {
      const response = await fetch('/api/version');
      const data = await response.json();

      if (data.hash && data.hash !== 'unknown' && data.hash !== BUILD_HASH) {
        console.log(`Version mismatch: client=${BUILD_HASH}, server=${data.hash}`);
        setShowUpdatePrompt(true);
      }
    } catch (error) {
      console.error('Version check failed:', error);
    }
  }, [dismissedUntil]);

  useEffect(() => {
    // Check version on mount
    checkVersion();

    // Check periodically
    const interval = setInterval(checkVersion, VERSION_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [checkVersion]);

  const handleDismiss = (dismissDuration) => {
    setShowUpdatePrompt(false);
    setDismissedUntil(Date.now() + dismissDuration);
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      {showUpdatePrompt && <UpdatePrompt onDismiss={handleDismiss} />}
      <Box sx={{ flexGrow: 1, pt: showUpdatePrompt ? '52px' : 0 }}>
        <AppBar position="static" elevation={0}>
          <Toolbar sx={{ minHeight: '48px !important', py: 0 }}>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontSize: '1.1rem' }}>
              HDHomeRun Signal
            </Typography>
          </Toolbar>
        </AppBar>
        <Container maxWidth="md" sx={{ mt: 1, px: 1 }}>
          <SignalMeter />
        </Container>
      </Box>
    </ThemeProvider>
  );
}

export default App;