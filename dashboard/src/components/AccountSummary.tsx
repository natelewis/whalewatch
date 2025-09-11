import React from 'react';
import { AlpacaAccount } from '../types';
import { DollarSign, CreditCard, Activity } from 'lucide-react';

interface AccountSummaryProps {
  account: AlpacaAccount;
}

export const AccountSummary: React.FC<AccountSummaryProps> = ({ account }) => {
  const formatCurrency = (value: string): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(parseFloat(value));
  };


  const cards = [
    {
      title: 'Portfolio Value',
      value: formatCurrency(account.portfolio_value),
      icon: DollarSign,
      change: account.equity !== account.last_equity ? 
        formatCurrency((parseFloat(account.equity) - parseFloat(account.last_equity)).toString()) : 
        null,
      changeType: parseFloat(account.equity) >= parseFloat(account.last_equity) ? 'positive' : 'negative'
    },
    {
      title: 'Buying Power',
      value: formatCurrency(account.buying_power),
      icon: CreditCard,
      subtitle: `Reg T: ${formatCurrency(account.regt_buying_power)}`
    },
    {
      title: 'Cash',
      value: formatCurrency(account.cash),
      icon: DollarSign,
      subtitle: `SMA: ${formatCurrency(account.sma)}`
    },
    {
      title: 'Day Trades',
      value: account.daytrade_count.toString(),
      icon: Activity,
      subtitle: account.pattern_day_trader ? 'Pattern Day Trader' : 'Regular Account'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <div key={index} className="bg-card p-6 rounded-lg border border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                <p className="text-2xl font-bold text-foreground">{card.value}</p>
                {card.subtitle && (
                  <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
                )}
                {card.change && (
                  <p className={`text-xs mt-1 ${
                    card.changeType === 'positive' ? 'text-green-500' : 'text-red-500'
                  }`}>
                    {card.changeType === 'positive' ? '+' : ''}{card.change}
                  </p>
                )}
              </div>
              <Icon className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
        );
      })}
    </div>
  );
};
