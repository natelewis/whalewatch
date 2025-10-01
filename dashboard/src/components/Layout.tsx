import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { BarChart3, Eye, Search, LogOut, Moon, Sun, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Auto-collapse on smaller screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        // lg breakpoint
        setIsCollapsed(true);
      }
    };

    // Set initial state based on screen size
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const navigation = [
    { name: 'Account', href: '/', icon: BarChart3 },
    { name: 'Analysis', href: '/analysis', icon: Eye },
    { name: 'Trade Finder', href: '/whale-finder', icon: Search },
  ];

  const isActive = (path: string): boolean => {
    return location.pathname === path;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-40 bg-card border-r border-border transition-all duration-300 ease-in-out ${
          isCollapsed ? 'w-16' : 'w-64'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo and Toggle Button */}
          <div className="flex items-center justify-center h-16 px-4 border-b border-border">
            {!isCollapsed ? (
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center space-x-3">
                  <img src="/whale-logo.png" alt="Whale Watch Logo" className="w-8 h-8" />
                  <h1 className="text-xl font-bold text-primary">Whale Watch</h1>
                </div>
                <button
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className="p-1 rounded-md hover:bg-accent transition-colors"
                  title="Collapse sidebar"
                >
                  <ChevronLeft size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="p-2 rounded-md hover:bg-accent transition-colors"
                title="Expand sidebar"
              >
                <ChevronRight size={20} />
              </button>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-2">
            {navigation.map(item => {
              const Icon = item.icon;
              return (
                <div key={item.name} className="relative group">
                  <Link
                    to={item.href}
                    className={`flex items-center rounded-md text-sm font-medium transition-colors ${
                      isActive(item.href)
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    } ${isCollapsed ? 'justify-center py-2' : 'px-3 py-2'}`}
                    title={isCollapsed ? item.name : undefined}
                  >
                    <Icon size={isCollapsed ? 20 : 20} className={isCollapsed ? '' : 'mr-3'} />
                    {!isCollapsed && item.name}
                  </Link>

                  {/* Tooltip for collapsed state */}
                  {isCollapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                      {item.name}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* User info and controls */}
          <div className="p-4 border-t border-border">
            {!isCollapsed && (
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-primary-foreground">
                      {user?.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{user?.name}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                </div>
              </div>
            )}

            {isCollapsed && (
              <div className="flex items-center justify-center mb-4">
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-primary-foreground">
                    {user?.name?.charAt(0).toUpperCase()}
                  </span>
                </div>
              </div>
            )}

            <div className={`flex ${isCollapsed ? 'flex-col space-y-2' : 'items-center justify-between'}`}>
              <div className="relative group">
                <button
                  onClick={toggleTheme}
                  className={`flex items-center rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors ${
                    isCollapsed ? 'justify-center w-full py-1' : 'px-3 py-2'
                  }`}
                  title={isCollapsed ? (isDark ? 'Switch to Light' : 'Switch to Dark') : undefined}
                >
                  {isDark ? (
                    <Sun size={isCollapsed ? 16 : 16} className={isCollapsed ? '' : 'mr-2'} />
                  ) : (
                    <Moon size={isCollapsed ? 16 : 16} className={isCollapsed ? '' : 'mr-2'} />
                  )}
                  {!isCollapsed && (isDark ? 'Light' : 'Dark')}
                </button>

                {/* Tooltip for collapsed state */}
                {isCollapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                    {isDark ? 'Switch to Light' : 'Switch to Dark'}
                  </div>
                )}
              </div>

              <div className="relative group">
                <button
                  onClick={logout}
                  className={`flex items-center rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors ${
                    isCollapsed ? 'justify-center w-full py-1' : 'px-3 py-2'
                  }`}
                  title={isCollapsed ? 'Logout' : undefined}
                >
                  <LogOut size={isCollapsed ? 16 : 16} className={isCollapsed ? '' : 'mr-2'} />
                  {!isCollapsed && 'Logout'}
                </button>

                {/* Tooltip for collapsed state */}
                {isCollapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                    Logout
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className={`transition-all duration-300 ease-in-out ${isCollapsed ? 'ml-16' : 'ml-64'}`}>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
};
