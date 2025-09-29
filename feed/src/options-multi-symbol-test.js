// Import the WebSocket library
import WebSocket from 'ws';

// Replace this with your actual Polygon.io API key
const API_KEY = 'R6reVCRquYldATUFUFNQnzc35F_AKwY3';

// The WebSocket URL for options
const wsUrl = 'wss://socket.polygon.io/options';

console.log('🚀 Testing multiple liquid option symbols...');
console.log('🕐 Current time:', new Date().toLocaleString());
console.log('📊 Plan: Options Advanced (Real-time data)');

// Highly liquid option symbols to test
const testSymbols = [
  // SPY options (most liquid)
  'SPY*',

  // AAPL options (very liquid)
  'AAPL*',

  // TSLA options (high volatility)
  'TSLA*',

  // NVDA options (AI/tech focus)
  'NVDA*',

  // MSFT options (stable tech)
  'MSFT*',

  // GOOGL options (tech giant)
  'GOOGL*',

  // QQQ options (tech ETF)
  'QQQ*',

  // IWM options (small cap ETF)
  'IWM*',

  // Specific contracts for today (Dec 20, 2024)
  'SPY241220C00550000', // SPY Dec 20 $550 Call
  'SPY241220P00550000', // SPY Dec 20 $550 Put
  'AAPL241220C00150000', // AAPL Dec 20 $150 Call
  'AAPL241220P00150000', // AAPL Dec 20 $150 Put
  'TSLA241220C00250000', // TSLA Dec 20 $250 Call
  'TSLA241220P00250000', // TSLA Dec 20 $250 Put
];

// Create a new WebSocket client
const socket = new WebSocket(wsUrl);

let isAuthenticated = false;
let messageCount = 0;
let tradeCount = 0;
let subscriptionCount = 0;
const receivedTrades = new Set();

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

        // Subscribe to all test symbols with delays
        testSymbols.forEach((symbol, index) => {
          setTimeout(() => {
            socket.send(
              JSON.stringify({
                action: 'subscribe',
                params: symbol,
              })
            );
            subscriptionCount++;
            console.log(`📡 [${subscriptionCount}] Subscribed to: ${symbol}`);
          }, index * 500); // 500ms delay between subscriptions
        });

        // Set a timeout to close connection if no trades received
        setTimeout(() => {
          if (tradeCount === 0) {
            console.log('⏰ No trades received in 5 minutes, closing connection...');
            console.log('💡 This could indicate:');
            console.log('   - Low option activity at this time');
            console.log('   - Need to try different strike prices');
            console.log('   - Market conditions affecting options');
            socket.close();
          }
        }, 300000); // 5 minutes
      }
    } else if (msg.ev === 'T') {
      tradeCount++;
      const tradeKey = `${msg.sym}_${msg.t}_${msg.p}_${msg.s}`;

      if (!receivedTrades.has(tradeKey)) {
        receivedTrades.add(tradeKey);
        console.log(`🎯 OPTION TRADE #${tradeCount} RECEIVED!`);
        console.log(`Symbol: ${msg.sym}`);
        console.log(`Price: $${msg.p}`);
        console.log(`Size: ${msg.s} contracts`);
        console.log(`Exchange: ${msg.x}`);
        console.log(`Conditions: ${msg.c ? JSON.stringify(msg.c) : 'None'}`);
        console.log(`Timestamp: ${new Date(msg.t).toLocaleString()}`);
        console.log(`Sequence: ${msg.q}`);
        console.log('----------------------------------------\n');

        // Close after receiving 3 trades to test
        if (tradeCount >= 3) {
          console.log('✅ Success! Received multiple option trades. Closing connection...');
          setTimeout(() => socket.close(), 2000);
        }
      }
    } else {
      console.log('❓ Other message:', msg.ev, msg);
    }
  }
});

// 3. Handle connection closing
socket.on('close', (code, reason) => {
  console.log(`❌ WebSocket connection closed: ${code} - ${reason}`);
  console.log(`📊 Final stats:`);
  console.log(`   - Total messages: ${messageCount}`);
  console.log(`   - Subscriptions: ${subscriptionCount}`);
  console.log(`   - Unique trades: ${tradeCount}`);
  console.log(`   - Symbols tested: ${testSymbols.length}`);
  process.exit(0);
});

// 4. Handle errors
socket.on('error', error => {
  console.error('❗️ WebSocket error:', error);
  process.exit(1);
});

// Monitor connection status
let lastTradeTime = Date.now();
setInterval(() => {
  const timeSinceLastTrade = Date.now() - lastTradeTime;
  console.log(`📊 Stats: ${messageCount} messages, ${tradeCount} trades, ${subscriptionCount} subscriptions`);

  if (tradeCount > 0) {
    lastTradeTime = Date.now();
  }

  if (timeSinceLastTrade > 120000 && tradeCount > 0) {
    // 2 minutes since last trade
    console.log('⚠️  No new trades for 2 minutes, but we did receive some data!');
  }
}, 30000); // Check every 30 seconds


