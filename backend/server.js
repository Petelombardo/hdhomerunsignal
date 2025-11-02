const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { exec } = require('child_process');
const path = require('path');
const cors = require('cors');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

class HDHomeRunController {
  constructor() {
    this.devices = [];
    this.activeDevice = null;
    this.activeTuner = 0;
    this.monitoringInterval = null;
  }

  async discoverDevices() {
    return new Promise((resolve, reject) => {
      exec('hdhomerun_config discover', (error, stdout, stderr) => {
        if (error) {
          console.error('Discovery error:', error);
          resolve([]);
          return;
        }

        const devices = [];
        const deviceSet = new Set(); // Track seen device IDs
        const lines = stdout.split('\n').filter(line => line.trim());
        
        lines.forEach(line => {
          const match = line.match(/hdhomerun device ([A-F0-9-]+) found at ([0-9.]+)/);
          if (match) {
            const deviceId = match[1];
            const deviceIp = match[2];
            
            // Only add if we haven't seen this device ID before
            if (!deviceSet.has(deviceId)) {
              deviceSet.add(deviceId);
              devices.push({
                id: deviceId,
                ip: deviceIp,
                name: `HDHomeRun ${deviceId}`
              });
            }
          }
        });

        this.devices = devices;
        resolve(devices);
      });
    });
  }

  async getDeviceInfo(deviceId) {
    return new Promise((resolve, reject) => {
      // Get both model and tuner count
      exec(`hdhomerun_config ${deviceId} get /sys/model`, (error, stdout) => {
        if (error) {
          resolve({ model: 'Unknown', tuners: 2, atsc3Support: false });
          return;
        }
        
        const model = stdout.trim();
        
        // ATSC 3.0 support - will be auto-detected based on PLP data availability
        const atsc3Support = true; // Auto-detect rather than model-based
        
        // Try to get actual tuner count by checking which tuners exist
        this.getTunerCount(deviceId).then(tunerCount => {
          resolve({ model, tuners: tunerCount, atsc3Support });
        }).catch(() => {
          // Fallback to model-based detection
          let tuners = 2;
          if (model.includes('PRIME')) tuners = 3;
          else if (model.includes('QUATTRO') || model.includes('QUATRO')) tuners = 4;
          else if (model.includes('DUO')) tuners = 2;
          else if (model.includes('FLEX')) tuners = 2;
          else if (model.includes('CONNECT')) tuners = 2;
          
          resolve({ model, tuners, atsc3Support });
        });
      });
    });
  }

  async getTunerCount(deviceId) {
    return new Promise((resolve, reject) => {
      // Check tuners 0-7 to see which ones exist
      const checkTuner = (tunerNum) => {
        return new Promise((resolveCheck) => {
          exec(`hdhomerun_config ${deviceId} get /tuner${tunerNum}/status`, (error, stdout) => {
            // If no error, tuner exists (even if status is 'none')
            resolveCheck(!error);
          });
        });
      };

      Promise.all([
        checkTuner(0), checkTuner(1), checkTuner(2), checkTuner(3),
        checkTuner(4), checkTuner(5), checkTuner(6), checkTuner(7)
      ]).then(results => {
        const tunerCount = results.filter(exists => exists).length;
        resolve(tunerCount > 0 ? tunerCount : 2); // Default to 2 if none found
      }).catch(() => {
        resolve(2); // Default fallback
      });
    });
  }

  async scanChannels(deviceId, tuner = 0, channelMap = 'us-bcast') {
    return new Promise((resolve, reject) => {
      const command = `hdhomerun_config ${deviceId} scan /tuner${tuner} ${channelMap}`;
      
      exec(command, { timeout: 60000 }, (error, stdout, stderr) => {
        if (error) {
          console.error('Scan error:', error);
          resolve([]);
          return;
        }

        const channels = [];
        const lines = stdout.split('\n');
        
        lines.forEach(line => {
          const scanMatch = line.match(/SCANNING: (\d+) \(([^)]+)\)/);
          const lockMatch = line.match(/LOCK: (\w+) \(ss=(\d+) snq=(\d+) seq=(\d+)\)/);
          const programMatch = line.match(/PROGRAM (\d+): ([\d.]+) (.+)/);
          
          if (scanMatch && lockMatch) {
            const frequency = scanMatch[1];
            const channel = scanMatch[2];
            const modulation = lockMatch[1];
            const signalStrength = parseInt(lockMatch[2]);
            const snr = parseInt(lockMatch[3]);
            const symbolQuality = parseInt(lockMatch[4]);
            
            channels.push({
              frequency,
              channel,
              modulation,
              signalStrength,
              snr,
              symbolQuality,
              programs: []
            });
          }
          
          if (programMatch && channels.length > 0) {
            const programNum = programMatch[1];
            const virtualChannel = programMatch[2];
            const name = programMatch[3];
            
            channels[channels.length - 1].programs.push({
              programNum,
              virtualChannel,
              name
            });
          }
        });

        resolve(channels);
      });
    });
  }

  async getTunerStatus(deviceId, tuner = 0) {
    return new Promise(async (resolve, reject) => {
      try {
        // Get both regular status and debug info simultaneously
        const [statusResult, debugResult] = await Promise.all([
          this.getStatusCommand(deviceId, tuner, 'status'),
          this.getStatusCommand(deviceId, tuner, 'debug')
        ]);

        if (!statusResult) {
          resolve(null);
          return;
        }

        const status = {};
        const statusLine = statusResult.trim();
        
        if (statusLine === 'none') {
          resolve({ channel: 'none', lock: false });
          return;
        }

        const patterns = {
          channel: /ch=([^\s]+)/,
          lock: /lock=([^\s]+)/,
          ss: /ss=(\d+)/,
          snq: /snq=(\d+)/,
          seq: /seq=(\d+)/,
          bps: /bps=(\d+)/,
          pps: /pps=(\d+)/
        };

        Object.entries(patterns).forEach(([key, pattern]) => {
          const match = statusLine.match(pattern);
          if (match) {
            status[key] = key === 'lock' ? match[1] : 
                         ['ss', 'snq', 'seq', 'bps', 'pps'].includes(key) ? 
                         parseInt(match[1]) : match[1];
          }
        });

        status.lock = status.lock !== undefined;
        
        // Extract dB values from debug output with educated conversion
        if (debugResult) {
          const dbgMatch = debugResult.match(/dbg=(\d+)-(\d+)\/(-?\d+)/);
          if (dbgMatch) {
            const signalRaw = parseInt(dbgMatch[1]);
            const snrRaw = parseInt(dbgMatch[2]);
            
            // Signal strength: map raw values to realistic ATSC dBm range
            // Based on observed data: 9-86 raw maps to roughly -80 to -40 dBm
            let estimatedSignalDbm;
            if (signalRaw >= 80) estimatedSignalDbm = -40 - (100 - signalRaw) * 0.5;  // Strong: -40 to -50
            else if (signalRaw >= 60) estimatedSignalDbm = -50 - (80 - signalRaw) * 0.5;   // Good: -50 to -60
            else if (signalRaw >= 20) estimatedSignalDbm = -60 - (60 - signalRaw) * 0.5;   // Fair: -60 to -80
            else estimatedSignalDbm = -80 - (20 - signalRaw) * 0.5;                       // Weak: -80+
            
            // SNR: more direct conversion (0-80 raw ≈ 0-25 dB)
            const estimatedSnrDb = snrRaw * 0.31; // Rough linear conversion
            
            status.ssDb = Math.round(estimatedSignalDbm * 10) / 10;
            status.snrDb = snrRaw > 0 ? Math.round(estimatedSnrDb * 10) / 10 : 0;
            status.debugRaw = `${signalRaw}-${snrRaw}/${dbgMatch[3]}`;
            
            console.log(`dB estimate: ${status.ss}% signal = ${signalRaw} raw → ${status.ssDb}dBm, ${status.snq}% SNR = ${snrRaw} raw → ${status.snrDb}dB`);
          }
        }
        
        resolve(status);
      } catch (error) {
        resolve(null);
      }
    });
  }

  async getStatusCommand(deviceId, tuner, command) {
    return new Promise((resolve) => {
      exec(`hdhomerun_config ${deviceId} get /tuner${tuner}/${command}`, (error, stdout) => {
        if (error) {
          resolve(null);
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  async getSignalDbValues(deviceId, tuner = 0) {
    return new Promise((resolve, reject) => {
      // Try to get dB values using various debug commands
      Promise.all([
        this.getDbValue(deviceId, tuner, 'debug'),
        this.getDbValue(deviceId, tuner, 'vstatus'),
        this.getDbValue(deviceId, tuner, 'streaminfo'),
        this.getDbValue(deviceId, tuner, 'plotsample')
      ]).then(results => {
        console.log(`dB query results for ${deviceId} tuner ${tuner}:`, results);
        
        const dbData = {};
        
        // Parse results for dB values
        results.forEach((result, index) => {
          if (result) {
            console.log(`Command ${index} output:`, result);
            
            // Look for HDHomeRun debug format: dbg=65-19/-1817
            const dbgMatch = result.match(/dbg=(\d+)-(\d+)\/(-?\d+)/);
            if (dbgMatch) {
              // Format appears to be: signal-snr/something
              const signalRaw = parseInt(dbgMatch[1]);
              const snrRaw = parseInt(dbgMatch[2]);
              const thirdValue = parseInt(dbgMatch[3]);
              
              // Convert to actual dB values 
              // Different conversion for ATSC 1.0 vs 3.0 - try simpler mapping
              // For 71% signal, expect around -50 to -60 dBm
              dbData.ssDb = -100 + (signalRaw * 0.5); // Linear scaling attempt
              dbData.snrDb = snrRaw;
              dbData.debugRaw = `${signalRaw}-${snrRaw}/${thirdValue}`;
              
              console.log(`Converted dB values: signal=${signalRaw} -> ${dbData.ssDb}dBm, snr=${snrRaw} -> ${dbData.snrDb}dB`);
            }
            
            // Look for standard dB patterns as fallback
            const ssDbMatch = result.match(/ss=(-?\d+(?:\.\d+)?)dBm/i);
            const snrDbMatch = result.match(/snr=(-?\d+(?:\.\d+)?)dB/i);
            const rssiMatch = result.match(/rssi=(-?\d+(?:\.\d+)?)/i);
            
            if (ssDbMatch) dbData.ssDb = parseFloat(ssDbMatch[1]);
            if (snrDbMatch) dbData.snrDb = parseFloat(snrDbMatch[1]);
            if (rssiMatch) dbData.rssi = parseFloat(rssiMatch[1]);
          }
        });
        
        console.log('Parsed dB data:', dbData);
        resolve(dbData);
      }).catch((error) => {
        console.log('dB query error:', error);
        resolve({});
      });
    });
  }

  async getDbValue(deviceId, tuner, command) {
    return new Promise((resolve) => {
      exec(`hdhomerun_config ${deviceId} get /tuner${tuner}/${command}`, (error, stdout) => {
        if (error) {
          resolve(null);
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  async getCurrentProgram(deviceId, tuner = 0) {
    return new Promise((resolve, reject) => {
      exec(`hdhomerun_config ${deviceId} get /tuner${tuner}/program`, (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }

        const program = stdout.trim();
        if (program && program !== 'none') {
          resolve(program);
        } else {
          resolve(null);
        }
      });
    });
  }

  async getCurrentChannelPrograms(deviceId, tuner = 0, maxRetries = 3) {
    return new Promise(async (resolve, reject) => {
      // First check if tuner is locked
      const status = await this.getTunerStatus(deviceId, tuner);
      if (!status || !status.lock || status.channel === 'none') {
        resolve([]);
        return;
      }

      let attempt = 0;
      const tryGetPrograms = () => {
        exec(`hdhomerun_config ${deviceId} get /tuner${tuner}/streaminfo`, (error, stdout) => {
          if (error) {
            if (attempt < maxRetries) {
              attempt++;
              setTimeout(tryGetPrograms, 1500); // Wait 1.5s between retries
              return;
            }
            resolve([]);
            return;
          }

          const programs = [];
          const lines = stdout.split('\n').filter(line => line.trim());
          
          lines.forEach(line => {
            // Enhanced parsing for both ATSC 1.0 and 3.0 formats
            // ATSC 1.0: tsid=0x0001 program=1: 12.1 WHYY (encrypted)
            // ATSC 3.0: service=1: 12.1 WHYY (atsc3) or program=1: 12.1 WHYY
            const programMatch = line.match(/(?:program|service)=(\d+):\s*([\d.]+)\s+(.+?)(?:\s+\(([^)]+)\))?$/);
            if (programMatch) {
              const programNum = programMatch[1];
              const virtualChannel = programMatch[2];
              const name = programMatch[3].trim();
              const status = programMatch[4] || '';
              
              programs.push({
                programNum,
                virtualChannel,
                name,
                callsign: name,
                status,
                encrypted: status.includes('encrypted'),
                atsc3: status.includes('atsc3')
              });
            } else {
              // Try alternative format parsing
              const altMatch = line.match(/(\d+):\s*([\d.]+)\s+(.+?)(?:\s+\(([^)]+)\))?$/);
              if (altMatch) {
                programs.push({
                  programNum: altMatch[1],
                  virtualChannel: altMatch[2],
                  name: altMatch[3].trim(),
                  callsign: altMatch[3].trim(),
                  status: altMatch[4] || '',
                  encrypted: (altMatch[4] || '').includes('encrypted'),
                  atsc3: (altMatch[4] || '').includes('atsc3')
                });
              }
            }
          });

          // If no programs found and we have retries left, try again
          if (programs.length === 0 && attempt < maxRetries) {
            attempt++;
            setTimeout(tryGetPrograms, 2000); // Wait longer for ATSC 3.0
            return;
          }

          resolve(programs);
        });
      };

      tryGetPrograms();
    });
  }

  async setChannel(deviceId, tuner, channel) {
    return new Promise((resolve, reject) => {
      // Handle ATSC 3.0 format: atsc3:27:0+1+2 or regular format: 27
      let command;
      if (channel.includes('atsc3:')) {
        command = `hdhomerun_config ${deviceId} set /tuner${tuner}/channel ${channel}`;
      } else {
        // For regular channels, check if we should use ATSC 3.0 format
        // This could be enhanced to auto-detect based on device capabilities
        command = `hdhomerun_config ${deviceId} set /tuner${tuner}/channel ${channel}`;
      }
      
      exec(command, (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout.trim());
      });
    });
  }

  async setAtsc3Channel(deviceId, tuner, channel, plps = []) {
    return new Promise((resolve, reject) => {
      let channelStr = `atsc3:${channel}`;
      if (plps.length > 0) {
        channelStr += `:${plps.join('+')}`;
      }
      
      exec(`hdhomerun_config ${deviceId} set /tuner${tuner}/channel ${channelStr}`, (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout.trim());
      });
    });
  }

  async incrementChannel(deviceId, tuner) {
    return new Promise((resolve, reject) => {
      exec(`hdhomerun_config ${deviceId} set /tuner${tuner}/channel +`, (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout.trim());
      });
    });
  }

  async decrementChannel(deviceId, tuner) {
    return new Promise((resolve, reject) => {
      exec(`hdhomerun_config ${deviceId} set /tuner${tuner}/channel -`, (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout.trim());
      });
    });
  }

  async clearTuner(deviceId, tuner) {
    return new Promise((resolve, reject) => {
      exec(`hdhomerun_config ${deviceId} set /tuner${tuner}/channel none`, (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout.trim());
      });
    });
  }

  async getPlpInfo(deviceId, tuner = 0) {
    return new Promise((resolve, reject) => {
      exec(`hdhomerun_config ${deviceId} get /tuner${tuner}/plpinfo`, (error, stdout) => {
        console.log(`PLP Info for ${deviceId} tuner ${tuner}:`, error ? 'ERROR: ' + error.message : stdout);
        
        if (error) {
          resolve(null);
          return;
        }

        const plpData = {};
        const lines = stdout.split('\n').filter(line => line.trim());
        
        lines.forEach(line => {
          // Parse PLP info output
          // Actual format: "0: sfi=0 mod=qam256 cod=10/15 layer=core ti=cti lls=1 lock=1"
          const plpMatch = line.match(/^(\d+):/);
          if (plpMatch) {
            const plpId = plpMatch[1];
            plpData[plpId] = {};
            
            // Extract all key=value pairs
            const sfiMatch = line.match(/sfi=(\w+)/);
            const modMatch = line.match(/mod=(\w+)/);
            const codMatch = line.match(/cod=([0-9/]+)/);
            const layerMatch = line.match(/layer=(\w+)/);
            const tiMatch = line.match(/ti=(\w+)/);
            const llsMatch = line.match(/lls=(\d+)/);
            const lockMatch = line.match(/lock=(\d+)/);
            
            if (sfiMatch) plpData[plpId].sfi = sfiMatch[1];
            if (modMatch) plpData[plpId].modulation = modMatch[1];
            if (codMatch) plpData[plpId].coderate = codMatch[1];
            if (layerMatch) plpData[plpId].layer = layerMatch[1];
            if (tiMatch) plpData[plpId].timeInterleaving = tiMatch[1];
            if (llsMatch) plpData[plpId].lls = llsMatch[1] === '1';
            if (lockMatch) plpData[plpId].lock = lockMatch[1] === '1';
          }
        });

        console.log('Parsed PLP data:', plpData);
        resolve(Object.keys(plpData).length > 0 ? plpData : null);
      });
    });
  }

  async getL1Info(deviceId, tuner = 0) {
    return new Promise((resolve, reject) => {
      exec(`hdhomerun_config ${deviceId} get /tuner${tuner}/l1info`, (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }

        const l1Data = {};
        const lines = stdout.split('\n').filter(line => line.trim());
        
        lines.forEach(line => {
          // Parse L1 info output
          // Format examples: l1_basic_mode=1 l1_detail_mode=2 fft_size=8192
          const keyValueMatch = line.match(/(\w+)=([^\s]+)/g);
          if (keyValueMatch) {
            keyValueMatch.forEach(match => {
              const [key, value] = match.split('=');
              l1Data[key] = value;
            });
          }
        });

        resolve(Object.keys(l1Data).length > 0 ? l1Data : null);
      });
    });
  }

  startMonitoring(socket, deviceId, tuner) {
    this.stopMonitoring();

    this.monitoringInterval = setInterval(async () => {
      try {
        const status = await this.getTunerStatus(deviceId, tuner);
        const currentProgram = await this.getCurrentProgram(deviceId, tuner);

        // Get ATSC 3.0 info if channel is tuned and device supports it
        let plpInfo = null;
        let l1Info = null;
        if (status && status.channel && status.channel !== 'none') {
          // Try to get ATSC 3.0 info - will return null if not ATSC 3.0
          plpInfo = await this.getPlpInfo(deviceId, tuner);
          l1Info = await this.getL1Info(deviceId, tuner);
        }

        socket.emit('tuner-status', {
          ...status,
          currentProgram,
          plpInfo,
          l1Info
        });
      } catch (error) {
        console.error('Monitoring error:', error);
      }
    }, 1000);
  }

  startAntennaMode(socket, deviceId, tunerCount) {
    this.stopMonitoring();

    console.log(`Starting antenna mode for device ${deviceId} with ${tunerCount} tuners`);

    this.monitoringInterval = setInterval(async () => {
      try {
        // Monitor all tuners simultaneously
        const allTunersData = await Promise.all(
          Array.from({ length: tunerCount }, (_, i) =>
            this.getTunerStatus(deviceId, i)
              .then(status => ({ tuner: i, status }))
              .catch(error => {
                console.error(`Error monitoring tuner ${i}:`, error);
                return { tuner: i, status: null };
              })
          )
        );

        socket.emit('antenna-mode-status', allTunersData);
      } catch (error) {
        console.error('Antenna mode monitoring error:', error);
      }
    }, 1000);
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }
}

const hdhrController = new HDHomeRunController();

// API Routes
app.get('/api/devices', async (req, res) => {
  try {
    const devices = await hdhrController.discoverDevices();
    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/devices/:id/info', async (req, res) => {
  try {
    const info = await hdhrController.getDeviceInfo(req.params.id);
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/devices/:id/scan/:tuner', async (req, res) => {
  try {
    const { id, tuner } = req.params;
    const { channelMap = 'us-bcast' } = req.query;
    const channels = await hdhrController.scanChannels(id, tuner, channelMap);
    res.json(channels);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/devices/:id/tuner/:tuner/status', async (req, res) => {
  try {
    const { id, tuner } = req.params;
    const status = await hdhrController.getTunerStatus(id, tuner);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/devices/:id/tuner/:tuner/programs', async (req, res) => {
  try {
    const { id, tuner } = req.params;
    const programs = await hdhrController.getCurrentChannelPrograms(id, tuner);
    res.json(programs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/devices/:id/tuner/:tuner/channel', async (req, res) => {
  try {
    const { id, tuner } = req.params;
    const { channel } = req.body;
    const result = await hdhrController.setChannel(id, tuner, channel);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/devices/:id/tuner/:tuner/channel/up', async (req, res) => {
  try {
    const { id, tuner } = req.params;
    const result = await hdhrController.incrementChannel(id, tuner);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/devices/:id/tuner/:tuner/channel/down', async (req, res) => {
  try {
    const { id, tuner } = req.params;
    const result = await hdhrController.decrementChannel(id, tuner);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/devices/:id/tuner/:tuner/clear', async (req, res) => {
  try {
    const { id, tuner } = req.params;
    const result = await hdhrController.clearTuner(id, tuner);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/devices/:id/tuner/:tuner/plpinfo', async (req, res) => {
  try {
    const { id, tuner } = req.params;
    const plpInfo = await hdhrController.getPlpInfo(id, tuner);
    res.json(plpInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/devices/:id/tuner/:tuner/l1info', async (req, res) => {
  try {
    const { id, tuner } = req.params;
    const l1Info = await hdhrController.getL1Info(id, tuner);
    res.json(l1Info);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/devices/:id/tuner/:tuner/atsc3', async (req, res) => {
  try {
    const { id, tuner } = req.params;
    const { channel, plps } = req.body;
    const result = await hdhrController.setAtsc3Channel(id, tuner, channel, plps);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Socket.IO for real-time updates
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('start-monitoring', ({ deviceId, tuner }) => {
    console.log(`Starting monitoring for device ${deviceId}, tuner ${tuner}`);
    hdhrController.startMonitoring(socket, deviceId, tuner);
  });

  socket.on('start-antenna-mode', ({ deviceId, tunerCount }) => {
    console.log(`Starting antenna mode for device ${deviceId} with ${tunerCount} tuners`);
    hdhrController.startAntennaMode(socket, deviceId, tunerCount);
  });

  socket.on('stop-monitoring', () => {
    console.log('Stopping monitoring');
    hdhrController.stopMonitoring();
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    hdhrController.stopMonitoring();
  });
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`HDHomeRun Signal server running on port ${PORT}`);
});