import React, { useState, useEffect, useRef } from 'react';
import { AlpacaAccount, AlpacaPosition, AlpacaActivity } from '../types';
import { apiService } from '../services/apiService';
import { useWebSocketContext } from '../hooks/useWebSocketContext';
import { AccountSummary } from '../components/AccountSummary';
import { PositionsTable } from '../components/PositionsTable';
import { ActivityHistory } from '../components/ActivityHistory';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { safeCallAsync, createUserFriendlyMessage } from '@whalewatch/shared';
import { logger } from '../utils/logger';

export const AccountPage: React.FC = () => {
  const [account, setAccount] = useState<AlpacaAccount | null>(null);
  const [positions, setPositions] = useState<AlpacaPosition[]>([]);
  const [activities, setActivities] = useState<AlpacaActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // WebSocket for real-time position updates
  const { lastMessage, sendMessage, isConnected } = useWebSocketContext();

  // Track if we've already subscribed to prevent duplicate subscriptions
  const hasSubscribedRef = useRef(false);
  const lastPositionsRef = useRef<string>('');

  useEffect(() => {
    loadAccountData();
  }, []);

  // Resubscribe when WebSocket reconnects or positions change
  useEffect(() => {
    if (isConnected && positions.length > 0) {
      const currentPositionsKey = positions
        .map(p => p.symbol)
        .sort()
        .join(',');

      // Only resubscribe if positions have actually changed or we haven't subscribed yet
      if (!hasSubscribedRef.current || lastPositionsRef.current !== currentPositionsKey) {
        logger.chart.loading(
          `WebSocket reconnected, resubscribing to account quotes for ${positions.length} positions`
        );
        const symbols = positions.map((p: AlpacaPosition) => p.symbol);
        sendMessage({
          type: 'subscribe',
          data: { channel: 'account_quote', symbols },
          timestamp: new Date().toISOString(),
        });

        hasSubscribedRef.current = true;
        lastPositionsRef.current = currentPositionsKey;
      }
    }
  }, [isConnected, positions, sendMessage]);

  useEffect(() => {
    if (lastMessage?.type === 'account_quote') {
      // Update position prices in real-time
      const accountData = lastMessage.data as {
        symbol: string;
        price: number;
        timestamp: string;
      };
      setPositions(prevPositions =>
        prevPositions.map(position => {
          if (position.symbol === accountData.symbol) {
            return {
              ...position,
              current_price: accountData.price.toString(),
              market_value: (parseFloat(position.qty) * accountData.price).toString(),
            };
          }
          return position;
        })
      );
    }
  }, [lastMessage]);

  const loadAccountData = async () => {
    setIsLoading(true);
    setError(null);

    const [accountResult, positionsResult, activitiesResult] = await Promise.all([
      safeCallAsync(() => apiService.getAccount()),
      safeCallAsync(() => apiService.getPositions()),
      safeCallAsync(() => apiService.getActivities()),
    ]);

    // Check if any failed
    if (accountResult.isErr()) {
      const userMessage = createUserFriendlyMessage(accountResult.error);
      setError(userMessage);
      return;
    }
    if (positionsResult.isErr()) {
      const userMessage = createUserFriendlyMessage(positionsResult.error);
      setError(userMessage);
      return;
    }
    if (activitiesResult.isErr()) {
      const userMessage = createUserFriendlyMessage(activitiesResult.error);
      setError(userMessage);
      return;
    }

    // All succeeded
    setAccount(accountResult.value.account);
    setPositions(positionsResult.value.positions);
    setActivities(activitiesResult.value.activities);

    // Subscribe to real-time quotes for positions
    if (positionsResult.value.positions.length > 0) {
      const symbols = positionsResult.value.positions.map((p: AlpacaPosition) => p.symbol);
      const positionsKey = symbols.sort().join(',');

      sendMessage({
        type: 'subscribe',
        data: { channel: 'account_quote', symbols },
        timestamp: new Date().toISOString(),
      });

      hasSubscribedRef.current = true;
      lastPositionsRef.current = positionsKey;
    }

    setIsLoading(false);
  };

  const handleRefresh = () => {
    // Reset subscription tracking when refreshing
    hasSubscribedRef.current = false;
    lastPositionsRef.current = '';
    loadAccountData();
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Account Dashboard</h1>
          <p className="text-muted-foreground">Monitor your portfolio and trading activity</p>
        </div>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Account Summary */}
      {account && <AccountSummary account={account} />}

      {/* Positions and Activity Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Positions */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Open Positions</h2>
          <PositionsTable positions={positions} />
        </div>

        {/* Activity History */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Recent Activity</h2>
          <ActivityHistory activities={activities} />
        </div>
      </div>
    </div>
  );
};
