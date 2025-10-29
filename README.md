# HDHomeRun Signal Monitor

A modern web application that replaces the discontinued HDHomeRun Signal Android app. This web app provides real-time signal monitoring, channel scanning, and device management for HDHomeRun devices.

## Features

- **Device Discovery**: Automatically finds HDHomeRun devices on your network
- **Real-time Signal Monitoring**: Live updates of signal strength, SNR quality, and symbol quality
- **Channel Scanning**: Scan and select channels across different channel maps (US Broadcast, Cable, HRC, IRC)
- **Multi-tuner Support**: Switch between tuners on devices that support multiple tuners
- **Responsive Design**: Works on both desktop and mobile devices
- **Modern UI**: Clean, dark theme interface with Material-UI components

## Screenshots Reference
<img src="blob:chrome-untrusted://media-app/b59358a3-37ea-41c3-99ce-9f0b53db6d92" alt="Screenshot_20251028-142919.webp"/><img width="864" height="1939" alt="image" src="https://github.com/user-attachments/assets/3a35fb89-b382-4069-895c-d12328ab2215" />


The original Android app functionality has been recreated with:
- Device selection dropdown (replaces device dropdown from original)
- Real-time signal strength, SNR quality, and symbol quality meters
- Channel scanning with signal information
- Channel map selection (us-bcast, us-cable, us-hrc, us-irc)
- Data rate monitoring

## Prerequisites

- Docker and Docker Compose
- HDHomeRun device(s) on your network
- Network access for device discovery (requires host networking mode)

## Installation & Setup

1. **Clone or download this project to your server**

2. **Build and start the container:**
   ```bash
   docker-compose up -d
   ```

3. **Access the web interface:**
   - Open your browser to `http://your-server-ip:3000`
   - The app will automatically discover HDHomeRun devices on your network

## Usage

1. **Device Selection**: Choose your HDHomeRun device from the dropdown
2. **Channel Map**: Select the appropriate channel map (US Broadcast is default)
3. **Tuner Selection**: Use the arrow buttons to switch between tuners
4. **Channel Selection**: Enter the channel you want to tune to and press the tuner icon or hit enter
5. **Monitor Signal**: View real-time signal strength, SNR, and symbol quality

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
- `GET /api/devices/:id/scan/:tuner` - Scan channels
- `GET /api/devices/:id/tuner/:tuner/status` - Get tuner status
- `POST /api/devices/:id/tuner/:tuner/channel` - Set channel

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
