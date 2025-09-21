import React, { useState } from 'react';
import { AlpacaActivity } from '../types';
import { Calendar, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';

interface ActivityHistoryProps {
  activities: AlpacaActivity[];
}

export const ActivityHistory: React.FC<ActivityHistoryProps> = ({ activities }) => {
  const [filter, setFilter] = useState<string>('all');

  const formatCurrency = (value: string): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(parseFloat(value));
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getActivityIcon = (activityType: string) => {
    switch (activityType) {
      case 'FILL':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'DIV':
        return <DollarSign className="h-4 w-4 text-blue-500" />;
      case 'DEP':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'WIT':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Calendar className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getActivityColor = (activityType: string): string => {
    switch (activityType) {
      case 'FILL':
        return 'text-green-500';
      case 'DIV':
        return 'text-blue-500';
      case 'DEP':
        return 'text-green-500';
      case 'WIT':
        return 'text-red-500';
      default:
        return 'text-muted-foreground';
    }
  };

  const getActivityDescription = (activity: AlpacaActivity): string => {
    switch (activity.activity_type) {
      case 'FILL':
        return `${activity.side?.toUpperCase()} ${activity.qty} ${activity.symbol} @ ${formatCurrency(activity.price || '0')}`;
      case 'DIV':
        return `Dividend from ${activity.symbol}`;
      case 'DEP':
        return `Deposit: ${formatCurrency(activity.net_amount || '0')}`;
      case 'WIT':
        return `Withdrawal: ${formatCurrency(activity.net_amount || '0')}`;
      default:
        return activity.description || activity.activity_type;
    }
  };

  const filteredActivities = activities.filter(activity => {
    if (filter === 'all') {
      return true;
    }
    return activity.activity_type === filter;
  });

  const activityTypes = [
    { value: 'all', label: 'All' },
    { value: 'FILL', label: 'Trades' },
    { value: 'DIV', label: 'Dividends' },
    { value: 'DEP', label: 'Deposits' },
    { value: 'WIT', label: 'Withdrawals' },
  ];

  if (activities.length === 0) {
    return (
      <div className="bg-card p-8 rounded-lg border border-border text-center">
        <p className="text-muted-foreground">No recent activity</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border">
      {/* Filter */}
      <div className="p-4 border-b border-border">
        <div className="flex space-x-2">
          {activityTypes.map(type => (
            <button
              key={type.value}
              onClick={() => setFilter(type.value)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                filter === type.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Activities List */}
      <div className="max-h-96 overflow-y-auto">
        {filteredActivities.map(activity => (
          <div key={activity.id} className="p-4 border-b border-border last:border-b-0 hover:bg-muted/50">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 mt-1">{getActivityIcon(activity.activity_type)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{getActivityDescription(activity)}</p>
                  <div className="text-right">
                    {activity.net_amount && (
                      <p className={`text-sm font-medium ${getActivityColor(activity.activity_type)}`}>
                        {parseFloat(activity.net_amount) >= 0 ? '+' : ''}
                        {formatCurrency(activity.net_amount)}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">{formatDate(activity.transaction_time)}</p>
                  </div>
                </div>
                {activity.order_id && (
                  <p className="text-xs text-muted-foreground mt-1">Order ID: {activity.order_id}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredActivities.length === 0 && (
        <div className="p-8 text-center">
          <p className="text-muted-foreground">No activities found for this filter</p>
        </div>
      )}
    </div>
  );
};
