import React, { useState, useEffect } from 'react';
import { AlpacaAccount, AlpacaPosition, AlpacaActivity } from '../types';
import { apiService } from '../services/apiService';
import { useWebSocket } from '../hooks/useWebSocket';
import { AccountSummary } from '../components/AccountSummary';
import { PositionsTable } from '../components/PositionsTable';
import { ActivityHistory } from '../components/ActivityHistory';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { safeCallAsync, createUserFriendlyMessage } from '@whalewatch/shared';

export const AccountPage: React.FC = () => {
  const [account, setAccount] = useState<AlpacaAccount | null>(null);
  const [positions, setPositions] = useState<AlpacaPosition[]>([]);
  const [activities, setActivities] = useState<AlpacaActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // WebSocket for real-time position updates
  const { lastMessage, sendMessage } = useWebSocket();

  useEffect(() => {
    loadAccountData();
  }, []);

  useEffect(() => {
    if (lastMessage?.type === 'account_quote') {
      // Update position prices in real-time
      const accountData = lastMessage.data as { symbol: string; price: number; timestamp: string };
      setPositions((prevPositions) =>
        prevPositions.map((position) => {
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
    const errors = [accountResult, positionsResult, activitiesResult]
      .filter((result) => result.isErr())
      .map((result) => result.error);

    if (errors.length > 0) {
      const userMessage = createUserFriendlyMessage(errors[0]);
      setError(userMessage);
    } else {
      // All succeeded
      setAccount(accountResult.value.account);
      setPositions(positionsResult.value.positions);
      setActivities(activitiesResult.value.activities);

      // Subscribe to real-time quotes for positions
      if (positionsResult.value.positions.length > 0) {
        const symbols = positionsResult.value.positions.map((p) => p.symbol);
        sendMessage({
          type: 'subscribe',
          data: { channel: 'account_quote', symbols },
          timestamp: new Date().toISOString(),
        });
      }
    }

    setIsLoading(false);
  };

  const handleRefresh = () => {
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
