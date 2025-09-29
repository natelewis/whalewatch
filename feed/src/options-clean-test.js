// Import the WebSocket library
import WebSocket from 'ws';

// Replace this with your actual Polygon.io API key
const API_KEY = 'R6reVCRquYldATUFUFNQnzc35F_AKwY3';

// The WebSocket URL for options
const wsUrl = 'wss://socket.polygon.io/options';

console.log('🚀 Starting clean options WebSocket test...');
console.log('🕐 Current time:', new Date().toLocaleString());

// Create a new WebSocket client
const socket = new WebSocket(wsUrl);

let isAuthenticated = false;
let messageCount = 0;
let tradeCount = 0;

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
  messageCount++;

  const messages = JSON.parse(data.toString());

  for (const msg of messages) {
    if (msg.ev === 'status') {
      console.log(`📊 Status: ${msg.status} - ${msg.message}`);

      if (msg.status === 'auth_success' && !isAuthenticated) {
        isAuthenticated = true;
        console.log('🔐 Authentication successful!');

        // Subscribe to SPY options using wildcard
        const subscriptionParams = 'SPY*';
        socket.send(
          JSON.stringify({
            action: 'subscribe',
            params: subscriptionParams,
          })
        );
        console.log(`📡 Subscribed to: ${subscriptionParams}`);

        // Set a timeout to close connection if no trades received
        setTimeout(() => {
          if (tradeCount === 0) {
            console.log('⏰ No trades received in 2 minutes, closing connection...');
            socket.close();
          }
        }, 120000); // 2 minutes
      }
    } else if (msg.ev === 'T') {
      tradeCount++;
      console.log(`🎯 OPTION TRADE #${tradeCount} RECEIVED!`);
      console.log(`Symbol: ${msg.sym}`);
      console.log(`Price: $${msg.p}`);
      console.log(`Size: ${msg.s} contracts`);
      console.log(`Exchange: ${msg.x}`);
      console.log(`Timestamp: ${new Date(msg.t).toLocaleString()}`);
      console.log('----------------------------------------\n');

      // Close after receiving first trade to test
      if (tradeCount === 1) {
        console.log('✅ Success! Received option trade data. Closing connection...');
        setTimeout(() => socket.close(), 1000);
      }
    } else {
      console.log('❓ Other message:', msg.ev, msg);
    }
  }
});

// 3. Handle connection closing
socket.on('close', (code, reason) => {
  console.log(`❌ WebSocket connection closed: ${code} - ${reason}`);
  console.log(`📊 Final stats: ${messageCount} total messages, ${tradeCount} trades received`);
  process.exit(0);
});

// 4. Handle errors
socket.on('error', error => {
  console.error('❗️ WebSocket error:', error);
  process.exit(1);
});

// Monitor connection status
setInterval(() => {
  console.log(`📊 Stats: ${messageCount} messages, ${tradeCount} trades received`);
}, 30000); // Check every 30 seconds


