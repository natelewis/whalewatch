// Import the WebSocket library
const WebSocket = require('ws');
const dotenv = require('dotenv');

dotenv.config();

// Replace this with your actual Polygon.io API key
const API_KEY = process.env.POLYGON_API_KEY;

// The WebSocket URL for options
const wsUrl = 'wss://socket.polygon.io/options';

// Create a new WebSocket client
const socket = new WebSocket(wsUrl);

let isAuthenticated = false;

// 1. Handle the connection opening
socket.on('open', () => {
  console.log('✅ WebSocket connection established.');

  // Authenticate with your API key
  socket.send(
    JSON.stringify({
      action: 'auth',
      params: API_KEY,
    })
  );
});

// 2. Handle incoming messages
socket.on('message', data => {
  const messages = JSON.parse(data.toString());

  for (const msg of messages) {
    if (msg.ev === 'status') {
      console.log(`📊 Status: ${msg.status} - ${msg.message}`);

      if (msg.status === 'max_connections') {
        console.error('❌ Maximum number of websocket connections exceeded. You have reached the connection limit for your account. Please contact support at https://polygon.io/contact to increase your limit.');
      }

      if (msg.status === 'auth_success' && !isAuthenticated) {
        isAuthenticated = true;
        console.log('🔐 Authentication successful!');

        // FIX #1: Added the 'T.O:' prefix and removed the unnecessary '*'
        const subscriptions = ['T.O:AAPL', 'T.O:AAPL241220C00150000'].join(',');
        socket.send(
          JSON.stringify({
            action: 'subscribe',
            params: subscriptions,
          })
        );
        console.log(`📡 Subscribed to: ${subscriptions}`);
      }
    } else if (msg.ev === 'T') {
      console.log('--- OPTION TRADE RECEIVED ---');
      console.log(`Symbol: ${msg.sym}`);
      console.log(`Price: ${msg.p}`);
      console.log(`Size: ${msg.s}`);
      console.log(`Timestamp: ${new Date(msg.t).toLocaleString()}`);
      console.log('------------------------------\n');
    }
  }
});

// 3. Handle connection closing
socket.on('close', (code, reason) => {
  console.log(`❌ WebSocket connection closed: ${code} - ${reason}`);
});

// 4. Handle errors
socket.on('error', error => {
  console.error('❗️ WebSocket error:', error);
});
