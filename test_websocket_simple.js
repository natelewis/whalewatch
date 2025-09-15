const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

// Generate a test JWT token
const secret = 'your_jwt_secret_key_here';
const token = jwt.sign(
  { 
    userId: 'test-user-123', 
    email: 'test@example.com' 
  },
  secret,
  { expiresIn: '1h' }
);

console.log('🔑 Generated test token:', token.substring(0, 50) + '...');

// Test WebSocket connection and subscription
const ws = new WebSocket(`ws://localhost:3001/ws?token=${token}`);

ws.on('open', function open() {
  console.log('🔌 Connected to WebSocket');
  
  // Subscribe to chart data for LLY
  const subscribeMessage = {
    type: 'subscribe',
    data: {
      channel: 'chart_quote',
      symbol: 'LLY'
    }
  };
  
  console.log('📊 Subscribing to chart data for LLY...');
  ws.send(JSON.stringify(subscribeMessage));
});

ws.on('message', function message(data) {
  const parsed = JSON.parse(data.toString());
  console.log('📨 Received message:', JSON.stringify(parsed, null, 2));
});

ws.on('error', function error(err) {
  console.error('❌ WebSocket error:', err);
});

ws.on('close', function close(code, reason) {
  console.log('🔌 WebSocket connection closed:', { code, reason: reason?.toString() });
});

// Keep the script running for a while to see messages
setTimeout(() => {
  console.log('⏰ Test completed, closing connection');
  ws.close();
}, 10000);
