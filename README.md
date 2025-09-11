# WhaleWatch 🐋

A comprehensive options and portfolio analysis application for active traders, featuring real-time whale trade monitoring and advanced charting capabilities.

## Features

### 🏦 Account Dashboard
- Real-time portfolio monitoring
- Position tracking with live P/L updates
- Complete activity history
- Secure order execution

### 🐋 Whale Spotting
- Real-time large options trades feed
- Configurable whale detection logic
- Live market monitoring
- Trade analysis tools

### 📈 Advanced Charting
- Professional-grade stock charts
- Multiple chart types (candlestick, line, bar, area)
- Technical indicators (SMA, EMA, RSI, MACD, Bollinger Bands)
- Drawing tools (trend lines, horizontal lines, Fibonacci)
- Real-time data updates

## Tech Stack

### Server (Node.js/Express/TypeScript)
- **Framework**: Express.js with TypeScript
- **Authentication**: JWT-based security
- **Real-time**: WebSocket server for live data
- **API Integration**: Alpaca Trading API
- **Testing**: Jest with comprehensive coverage

### Dashboard (React/TypeScript)
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with dark mode
- **Charts**: Lightweight Charts library
- **State Management**: React Context
- **Testing**: Vitest with Testing Library

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Alpaca API credentials

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd whalewatch
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Configure environment variables**
   
   **Server configuration** (`server/env.example` → `server/.env`):
   ```env
   ALPACA_API_KEY=your_alpaca_api_key
   ALPACA_SECRET_KEY=your_alpaca_secret_key
   ALPACA_BASE_URL=https://paper-api.alpaca.markets
   ALPACA_DATA_URL=https://data.alpaca.markets
   JWT_SECRET=your_jwt_secret_key_here
   JWT_EXPIRES_IN=24h
   PORT=3001
   NODE_ENV=development
   CORS_ORIGIN=http://localhost:5173
   ```

   **Dashboard configuration** (`dashboard/env.example` → `dashboard/.env`):
   ```env
   VITE_API_URL=http://localhost:3001
   VITE_WS_URL=ws://localhost:3001
   ```

4. **Start the development servers**
   ```bash
   npm run dev
   ```

   This will start both the server (port 3001) and dashboard (port 5173) concurrently.

### Demo Credentials
- **Email**: demo@whalewatch.com
- **Password**: password

## Project Structure

```
whalewatch/
├── server/                 # Node.js/Express backend
│   ├── src/
│   │   ├── routes/        # API route handlers
│   │   ├── services/      # Business logic services
│   │   ├── middleware/    # Express middleware
│   │   ├── websocket/     # WebSocket server
│   │   ├── types/         # TypeScript type definitions
│   │   └── __tests__/     # Server tests
│   └── package.json
├── dashboard/             # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── services/      # API service layer
│   │   ├── contexts/      # React context providers
│   │   ├── types/         # TypeScript type definitions
│   │   └── __tests__/     # Dashboard tests
│   └── package.json
└── package.json           # Root package.json
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/auth/verify` - Token verification

### Account Management
- `GET /api/account/info` - Account information
- `GET /api/account/positions` - Open positions
- `GET /api/account/activity` - Account activity history

### Trading
- `POST /api/orders/sell` - Create sell order
- `POST /api/orders/buy` - Create buy order

### Market Data
- `GET /api/chart/:symbol` - Historical chart data
- `GET /api/options/:symbol/recent` - Recent options trades

### WebSocket Channels
- `options_whale` - Real-time large options trades
- `account_quote` - Real-time position quotes
- `chart_quote` - Real-time chart data

## Testing

### Server Tests
```bash
cd server
npm test                 # Run tests
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
```

### Dashboard Tests
```bash
cd dashboard
npm test                # Run tests
npm run test:ui         # UI test runner
npm run test:coverage   # Coverage report
```

### Test Coverage
- **Server**: 80%+ coverage requirement
- **Dashboard**: 80%+ coverage requirement
- **E2E Tests**: Complete user flow testing

## Development

### Code Quality
- **TypeScript**: Strict mode enabled
- **ESLint**: Configured for React and Node.js
- **Prettier**: Code formatting
- **Husky**: Pre-commit hooks

### Git Workflow
1. Create feature branch
2. Write tests first (TDD)
3. Implement feature
4. Ensure all tests pass
5. Submit pull request

## Deployment

### Production Build
```bash
npm run build
```

### Environment Setup
- Set production environment variables
- Configure Alpaca API credentials
- Set up SSL certificates
- Configure reverse proxy (nginx)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write comprehensive tests
4. Ensure code quality standards
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the test files for usage examples