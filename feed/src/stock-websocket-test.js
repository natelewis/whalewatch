// Import the WebSocket library
import WebSocket from 'ws';

// Replace this with your actual Polygon.io API key
const API_KEY = 'R6reVCRquYldATUFUFNQnzc35F_AKwY3';

// The WebSocket URL for stocks
const wsUrl = 'wss://socket.polygon.io/stocks';

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

      if (msg.status === 'auth_success' && !isAuthenticated) {
        isAuthenticated = true;
        console.log('🔐 Authentication successful!');

        // Subscribe to SPY stock trades (this should work with basic plan)
        const subscriptionParams = 'T.SPY';
        socket.send(
          JSON.stringify({
            action: 'subscribe',
            params: subscriptionParams,
          })
        );
        console.log(`📡 Subscribed to: ${subscriptionParams}`);
      }
    } else if (msg.ev === 'T') {
      console.log('--- STOCK TRADE RECEIVED ---');
      console.log(`Symbol: ${msg.sym}`);
      console.log(`Price: ${msg.p}`);
      console.log(`Size: ${msg.s}`);
      console.log(`Timestamp: ${new Date(msg.t).toLocaleString()}`);
      console.log('---------------------------\n');
    } else {
      console.log('Other message:', msg);
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


