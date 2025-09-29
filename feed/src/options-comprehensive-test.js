// Import the WebSocket library
import WebSocket from 'ws';

// Replace this with your actual Polygon.io API key
const API_KEY = 'R6reVCRquYldATUFUFNQnzc35F_AKwY3';

// The WebSocket URL for options
const wsUrl = 'wss://socket.polygon.io/options';

// Create a new WebSocket client
const socket = new WebSocket(wsUrl);

let isAuthenticated = false;
let messageCount = 0;
let lastMessageTime = Date.now();

// 1. Handle the connection opening
socket.on('open', () => {
  console.log('✅ WebSocket connection established.');
  console.log('🕐 Current time:', new Date().toLocaleString());
  console.log('📅 Market status:', isMarketOpen() ? 'OPEN' : 'CLOSED');

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
  lastMessageTime = Date.now();

  const messages = JSON.parse(data.toString());
  console.log('📨 Raw messages:', JSON.stringify(messages, null, 2));

  for (const msg of messages) {
    if (msg.ev === 'status') {
      console.log(`📊 Status: ${msg.status} - ${msg.message}`);

      if (msg.status === 'auth_success' && !isAuthenticated) {
        isAuthenticated = true;
        console.log('🔐 Authentication successful!');

        // Try multiple subscription approaches
        const subscriptions = [
          'SPY*', // Wildcard for all SPY options
          'AAPL*', // Wildcard for all AAPL options
          'TSLA*', // Wildcard for all TSLA options
          'SPY241220C00550000', // Specific SPY contract
          'AAPL241220C00150000', // Specific AAPL contract
        ];

        subscriptions.forEach((sub, index) => {
          setTimeout(() => {
            socket.send(
              JSON.stringify({
                action: 'subscribe',
                params: sub,
              })
            );
            console.log(`📡 [${index + 1}] Subscribed to: ${sub}`);
          }, index * 1000); // Stagger subscriptions by 1 second
        });
      }
    } else if (msg.ev === 'T') {
      console.log('🎯 OPTION TRADE RECEIVED!');
      console.log(`Symbol: ${msg.sym}`);
      console.log(`Price: $${msg.p}`);
      console.log(`Size: ${msg.s} contracts`);
      console.log(`Exchange: ${msg.x}`);
      console.log(`Conditions: ${msg.c ? JSON.stringify(msg.c) : 'None'}`);
      console.log(`Timestamp: ${new Date(msg.t).toLocaleString()}`);
      console.log(`Sequence: ${msg.q}`);
      console.log('----------------------------------------\n');
    } else {
      console.log('❓ Other message type:', msg.ev, msg);
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

// Helper function to check if market is open
function isMarketOpen() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 6 = Saturday
  const hour = now.getHours();
  const minute = now.getMinutes();
  const timeInMinutes = hour * 60 + minute;

  // Market is closed on weekends
  if (day === 0 || day === 6) return false;

  // Market hours: 9:30 AM - 4:00 PM ET (930 - 1200 minutes)
  const marketOpen = 9 * 60 + 30; // 9:30 AM
  const marketClose = 16 * 60; // 4:00 PM

  return timeInMinutes >= marketOpen && timeInMinutes <= marketClose;
}

// Monitor connection status
setInterval(() => {
  const timeSinceLastMessage = Date.now() - lastMessageTime;
  console.log(
    `📊 Stats: ${messageCount} messages received, ${Math.round(timeSinceLastMessage / 1000)}s since last message`
  );

  if (timeSinceLastMessage > 300000) {
    // 5 minutes without messages
    console.log('⚠️  No messages received for 5 minutes. Possible issues:');
    console.log('   - Market is closed');
    console.log('   - No active trading in subscribed options');
    console.log('   - API plan limitations (15-min delay vs real-time)');
    console.log('   - Low liquidity in option contracts');
    console.log('   - Need to upgrade to Options Advanced/Business plan');
  }
}, 60000); // Check every minute

console.log('🚀 Starting comprehensive options WebSocket test...');
console.log('💡 This test will try multiple subscription approaches');
console.log('📋 Check your Polygon.io plan level for real-time vs delayed data');


