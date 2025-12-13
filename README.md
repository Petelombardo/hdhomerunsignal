# HDHomeRun Signal Monitor

A modern web application that replaces the discontinued HDHomeRun Signal Android app. This web app provides real-time signal monitoring, channel tuning, and device management for HDHomeRun devices.

## Features

- **Device Discovery**: Automatically finds HDHomeRun devices on your network
- **Real-time Signal Monitoring**: Live updates of signal strength, SNR quality, and symbol quality with dBm/dB estimates
- **Antenna Tuning Mode**: Monitor all tuners simultaneously with real-time graphs for optimal antenna positioning
- **Direct Channel Tuning**: Quickly tune to specific channels with channel up/down controls
- **Multi-tuner Support**: Switch between tuners on devices that support multiple tuners
- **ATSC 3.0 Support**: Displays PLP and L1 information for NextGen TV broadcasts
- **Program Detection**: Automatically shows available programs/PIDs on tuned channels
- **Progressive Web App**: Install on mobile devices for a native app experience
- **Responsive Design**: Works on both desktop and mobile devices
- **Modern UI**: Clean, dark theme interface with Material-UI components

## Screenshots Reference
Main Mode
<img src="blob:chrome-untrusted://media-app/f33b07c7-47ab-4f8b-b132-f065949c5bfb" alt="screenshot-hdhrsignal.png"/><img width="742" height="1285" alt="image" src="https://github.com/user-attachments/assets/2de59b75-0c89-43b9-991a-4b24bde06a9f" />

Antenna Mode
<img width="1084" height="1252" alt="image" src="https://github.com/user-attachments/assets/1fab4b4e-dc43-428c-9367-4324bb79d8df" />


The original Android app functionality has been recreated and enhanced with:
- Device selection dropdown
- Real-time signal strength, SNR quality, and symbol quality meters with dB conversion
- **Antenna tuning mode** - simultaneous monitoring of all tuners with real-time graphing (new!)
- Direct channel tuning with up/down controls
- Channel map selection (us-bcast, us-cable, us-hrc, us-irc)
- Data rate monitoring
- Program/PID listing for tuned channels
- ATSC 3.0 advanced information display
- Automatic reconnection after network interruptions

## Prerequisites

- Docker and Docker Compose
- HDHomeRun device(s) on your network
- Network access for device discovery (requires host networking mode)

### System Requirements

This application supports all modern CPU architectures including:
- **x86_64** (AMD64) - Traditional desktops and servers
- **ARM64** (aarch64) - Raspberry Pi 3/4/5, Apple Silicon Macs, AWS Graviton
- **ARMv7** - Older Raspberry Pi models (Pi 2)

**Running on a Raspberry Pi is ideal** for this application. A Raspberry Pi provides:
- Low power consumption (perfect for 24/7 operation)
- Small form factor (can be placed near your antenna/HDHomeRun)
- More than sufficient processing power for signal monitoring
- Cost-effective dedicated hardware

The Docker image will automatically select the correct architecture for your platform.

## Installation & Setup

Pull the pre-built container from Docker Hub
https://hub.docker.com/r/petelombardo/hdhomerun-signal-web

OR

1. **Clone or download this project to your server**

2. **Build and start the container:**
   ```bash
   docker-compose up -d
   ```

3. **Access the web interface:**
   - Open your browser to `http://your-server-ip:3000`
   - The app will automatically discover HDHomeRun devices on your network

## Usage

### Normal Mode

1. **Device Selection**: Choose your HDHomeRun device from the dropdown
2. **Tuner Selection**: Select which tuner to monitor/control
3. **Channel Tuning**:
   - Enter a channel number and press the tune button or hit Enter
   - Use the Previous/Next buttons to step through channels
   - The app automatically detects channels tuned by other applications (e.g., tvheadend)
4. **Monitor Signal**: View real-time signal strength (dBm), SNR (dB), and symbol quality
5. **View Programs**: See detected programs/PIDs and ATSC 3.0 technical details when available
6. **Channel Map**: Select the appropriate channel map (US Broadcast is default)

### Antenna Tuning Mode

Perfect for aligning your antenna for optimal signal reception:

1. **Activate**: Click the satellite icon button next to the device selector
2. **View All Tuners**: See real-time signal data from all tuners simultaneously in a grid layout
3. **Monitor Symbol Quality**: Each tuner shows a color-coded badge:
   - **Green** (100%): Perfect signal lock - antenna is properly aligned
   - **Red** (<100%): Signal present but poor - keep adjusting
   - **Gray** (0%): No signal detected
4. **Watch the Graphs**: Side-by-side real-time graphs show:
   - **Signal Strength** (left): Overall signal power over last 60 seconds
   - **SNR Quality** (right): Signal-to-noise ratio over last 60 seconds
5. **Optimize Your Antenna**:
   - Prioritize getting Symbol Quality to 100% (green) on all tuned channels
   - Then maximize SNR quality for better reception in varying conditions
   - Signal strength helps with initial rough positioning
6. **Return to Normal Mode**: Click the satellite icon again

## Configuration

### Channel Maps
- **US Broadcast**: Standard over-the-air channels
- **US Cable**: Cable TV channels
- **US HRC**: Harmonically Related Carrier cable
- **US IRC**: Incrementally Related Carrier cable

### Signal Quality Interpretation
- **Signal Strength**: Raw power level (aim for 80%+)
- **SNR Quality**: Signal-to-noise ratio (aim for 80%+)
- **Symbol Quality**: Error correction quality (should be 100% when properly aligned)

## Technical Details

### Architecture
- **Frontend**: React with Material-UI
- **Backend**: Node.js with Express and Socket.io
- **Communication**: REST API + WebSockets for real-time updates
- **HDHomeRun Integration**: Uses `hdhomerun_config` command-line tool

### Docker Configuration
- Uses host networking mode for device discovery
- Multi-stage build for optimized image size
- Automatic installation of hdhomerun_config binary

### API Endpoints
- `GET /api/devices` - Discover HDHomeRun devices
- `GET /api/devices/:id/info` - Get device information
- `GET /api/devices/:id/tuner/:tuner/status` - Get tuner status
- `GET /api/devices/:id/tuner/:tuner/programs` - Get programs on current channel
- `GET /api/devices/:id/tuner/:tuner/plpinfo` - Get ATSC 3.0 PLP information
- `GET /api/devices/:id/tuner/:tuner/l1info` - Get ATSC 3.0 L1 information
- `POST /api/devices/:id/tuner/:tuner/channel` - Set channel
- `POST /api/devices/:id/tuner/:tuner/clear` - Clear/stop tuner
- WebSocket: `start-monitoring` - Begin real-time signal updates
- WebSocket: `stop-monitoring` - Stop real-time signal updates

## Development

To run in development mode:

1. **Backend** (in `/backend` directory):
   ```bash
   npm install
   npm run dev
   ```

2. **Frontend** (in `/frontend` directory):
   ```bash
   npm install
   npm start
   ```

## Troubleshooting

### No devices found
- Ensure HDHomeRun devices are on the same network
- Check that host networking mode is enabled in Docker
- Verify `hdhomerun_config discover` works from command line

### Poor signal quality
- Use Signal Strength for rough antenna direction
- Optimize antenna position based on SNR Quality
- Symbol Quality should reach 100% when properly aligned

### Connection issues
- Check firewall settings
- Ensure port 3000 is accessible
- Verify Docker container is running with host networking

## License

This project is provided as-is for personal use. HDHomeRun is a trademark of SiliconDust Engineering Ltd.
