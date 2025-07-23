'use client'
import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Calendar, Star, Zap, Award, Search, Filter, Wifi, WifiOff, RefreshCw } from 'lucide-react';

const PokemonPriceDashboard = () => {
  const [cards, setCards] = useState([]);
  const [filteredCards, setFilteredCards] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [selectedTimeframe, setSelectedTimeframe] = useState('6M');
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // WebSocket connection for real-time updates
  useEffect(() => {
    connectWebSocket();
    fetchInitialData();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  const connectWebSocket = () => {
    try {
      // Close existing connection if any
      if (wsRef.current) {
        wsRef.current.close();
      }

      // Check if backend is available before connecting
      console.log('Attempting to connect to WebSocket...');
      wsRef.current = new WebSocket('ws://localhost:8080/ws');
      
      wsRef.current.onopen = () => {
        setConnected(true);
        setReconnectAttempts(0);
        console.log('WebSocket connected successfully');
        showNotification('Connected to live updates! 🎉', 'success');
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const newCards = JSON.parse(event.data);
          console.log('Received card update via WebSocket:', newCards.length, 'cards');
          setCards(newCards);
          setLastUpdate(new Date());
          showNotification(`Updated ${newCards.length} cards! 📈`, 'success');
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          showNotification('Error parsing update data', 'error');
        }
      };
      
      wsRef.current.onclose = (event) => {
        setConnected(false);
        console.log('WebSocket disconnected, code:', event.code, 'reason:', event.reason);
        
        // Only attempt reconnect if it wasn't a manual close
        if (event.code !== 1000 && reconnectAttempts < 5) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1}/5)`);
          showNotification(`Reconnecting in ${Math.round(delay/1000)}s...`, 'warning');
          
          reconnectTimeoutRef.current = setTimeout(() => {
            setReconnectAttempts(prev => prev + 1);
            connectWebSocket();
          }, delay);
        } else if (reconnectAttempts >= 5) {
          showNotification('Connection lost. Please refresh the page or check backend.', 'error');
        }
      };
      
      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnected(false);
        showNotification('WebSocket connection error', 'error');
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      setConnected(false);
      showNotification('Failed to establish WebSocket connection', 'error');
    }
  };

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      console.log('Fetching initial data from backend...');
      const response = await fetch('http://localhost:8080/api/cards');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Successfully fetched', data.length, 'cards from API');
      setCards(data || []);
      setLoading(false);
      showNotification(`Loaded ${data.length} cards from database`, 'success');
    } catch (error) {
      console.error('Error fetching data from backend:', error);
      setLoading(false);
      // Use mock data as fallback
      console.log('Backend unavailable, using mock data as fallback');
      setCards(mockCards);
      showNotification('Backend unavailable - using demo data. Start your Go server!', 'warning');
    }
  };

  const triggerManualScrape = async () => {
    try {
      showNotification('Starting manual scrape...', 'info');
      const response = await fetch('http://localhost:8080/api/scrape', {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('Manual scrape result:', result);
      showNotification('Scrape started! Data will update shortly.', 'success');
    } catch (error) {
      console.error('Error triggering manual scrape:', error);
      showNotification('Failed to start scrape. Check backend connection.', 'error');
    }
  };

  const showNotification = (message, type = 'info') => {
    const colors = {
      success: 'bg-green-500',
      error: 'bg-red-500',
      warning: 'bg-yellow-500',
      info: 'bg-blue-500'
    };
    
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 ${colors[type]} text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-pulse max-w-sm`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 4000);
  };

  // Filter cards based on search and filter criteria
  useEffect(() => {
    let filtered = cards.filter(card => 
      card.name && card.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      (selectedFilter === 'all' || card.condition === selectedFilter)
    );
    setFilteredCards(filtered);
  }, [cards, searchTerm, selectedFilter]);

  // Mock data for fallback
  const mockCards = [
    { id: 1, name: 'Charizard ex Special Art', price: 389.99, change: 15.2, changePercent: 15.2, condition: 'New', rarity: 'Special Illustration Rare', source: 'TCGPlayer', image: '🔥' },
    { id: 2, name: 'Pikachu ex 151', price: 124.50, change: -5.8, changePercent: -5.8, condition: 'Near Mint', rarity: 'Ultra Rare', source: 'PriceCharting', image: '⚡' },
    { id: 3, name: 'Mew ex Rainbow', price: 156.75, change: 8.4, changePercent: 8.4, condition: 'New', rarity: 'Secret Rare', source: 'TCGPlayer', image: '💫' },
    { id: 4, name: 'Alakazam ex', price: 89.99, change: 12.1, changePercent: 12.1, condition: 'Lightly Played', rarity: 'Ultra Rare', source: 'PriceCharting', image: '🔮' },
    { id: 5, name: 'Venusaur ex', price: 198.25, change: -3.2, changePercent: -3.2, condition: 'New', rarity: 'Ultra Rare', source: 'TCGPlayer', image: '🌿' },
    { id: 6, name: 'Blastoise ex', price: 167.80, change: 6.7, changePercent: 6.7, condition: 'Near Mint', rarity: 'Ultra Rare', source: 'PriceCharting', image: '🌊' },
  ];

  const mockPriceData = [
    { date: '2024-01', charizard: 300, pikachu: 45, mew: 120, alakazam: 75 },
    { date: '2024-02', charizard: 320, pikachu: 48, mew: 135, alakazam: 82 },
    { date: '2024-03', charizard: 340, pikachu: 52, mew: 145, alakazam: 88 },
    { date: '2024-04', charizard: 360, pikachu: 55, mew: 155, alakazam: 95 },
    { date: '2024-05', charizard: 380, pikachu: 58, mew: 165, alakazam: 102 },
    { date: '2024-06', charizard: 400, pikachu: 62, mew: 175, alakazam: 110 },
  ];

  const conditionData = [
    { name: 'New', value: 35, color: '#10B981' },
    { name: 'Near Mint', value: 28, color: '#3B82F6' },
    { name: 'Lightly Played', value: 20, color: '#F59E0B' },
    { name: 'Moderately Played', value: 12, color: '#EF4444' },
    { name: 'Heavily Played', value: 5, color: '#6B7280' }
  ];

  const topCards = filteredCards
    .sort((a, b) => b.price - a.price)
    .slice(0, 5);

  const totalValue = filteredCards.reduce((sum, card) => sum + card.price, 0);
  const averagePrice = filteredCards.length > 0 ? totalValue / filteredCards.length : 0;
  const gainers = filteredCards.filter(card => card.change > 0).length;
  const losers = filteredCards.filter(card => card.change < 0).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-xl">Loading Pokemon card data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 text-white">
      {/* Header */}
      <div className="bg-black/20 backdrop-blur-sm border-b border-white/10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="text-3xl">⚡</div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-yellow-400 to-purple-400 bg-clip-text text-transparent">
                  Pokemon Card Tracker
                </h1>
                <p className="text-sm text-gray-300">Real-time market analysis</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                {connected ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <Wifi className="h-5 w-5 text-green-400" />
                    <span className="text-sm text-green-400 font-medium">Live Connected</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                    <WifiOff className="h-5 w-5 text-red-400" />
                    <span className="text-sm text-red-400">Offline</span>
                    <button
                      onClick={connectWebSocket}
                      className="text-xs bg-red-600 hover:bg-red-700 px-2 py-1 rounded transition-colors"
                    >
                      Reconnect
                    </button>
                  </div>
                )}
              </div>
              
              <button
                onClick={triggerManualScrape}
                className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Refresh Data</span>
              </button>
              
              <div className="text-sm text-gray-300">
                Last updated: {lastUpdate.toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="container mx-auto px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-300 text-sm">Total Cards</p>
                <p className="text-2xl font-bold">{filteredCards.length}</p>
              </div>
              <Star className="h-8 w-8 text-yellow-400" />
            </div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-300 text-sm">Average Price</p>
                <p className="text-2xl font-bold">${averagePrice.toFixed(2)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-400" />
            </div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-300 text-sm">Price Gainers</p>
                <p className="text-2xl font-bold text-green-400">{gainers}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-400" />
            </div>
          </div>
          
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-300 text-sm">Price Losers</p>
                <p className="text-2xl font-bold text-red-400">{losers}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-400" />
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search Pokemon cards..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            
            <div className="flex gap-4">
              <select
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value)}
                className="px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="all">All Conditions</option>
                <option value="New">New</option>
                <option value="Near Mint">Near Mint</option>
                <option value="Lightly Played">Lightly Played</option>
                <option value="Moderately Played">Moderately Played</option>
                <option value="Heavily Played">Heavily Played</option>
              </select>
              
              <select
                value={selectedTimeframe}
                onChange={(e) => setSelectedTimeframe(e.target.value)}
                className="px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="1W">1 Week</option>
                <option value="1M">1 Month</option>
                <option value="3M">3 Months</option>
                <option value="6M">6 Months</option>
                <option value="1Y">1 Year</option>
              </select>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Price Trends Chart */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
            <h3 className="text-xl font-bold mb-4 flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-green-400" />
              Price Trends ({selectedTimeframe})
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={mockPriceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1F2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px'
                  }} 
                />
                <Legend />
                <Line type="monotone" dataKey="charizard" stroke="#EF4444" strokeWidth={2} name="Charizard" />
                <Line type="monotone" dataKey="pikachu" stroke="#F59E0B" strokeWidth={2} name="Pikachu" />
                <Line type="monotone" dataKey="mew" stroke="#8B5CF6" strokeWidth={2} name="Mew" />
                <Line type="monotone" dataKey="alakazam" stroke="#10B981" strokeWidth={2} name="Alakazam" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Condition Distribution */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
            <h3 className="text-xl font-bold mb-4 flex items-center">
              <Award className="h-5 w-5 mr-2 text-blue-400" />
              Card Conditions
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={conditionData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {conditionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Cards Table */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
          <h3 className="text-xl font-bold mb-6 flex items-center">
            <Zap className="h-5 w-5 mr-2 text-yellow-400" />
            Top Pokemon Cards
          </h3>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="text-left py-3 px-4">Card</th>
                  <th className="text-left py-3 px-4">Price</th>
                  <th className="text-left py-3 px-4">Change</th>
                  <th className="text-left py-3 px-4">Condition</th>
                  <th className="text-left py-3 px-4">Rarity</th>
                  <th className="text-left py-3 px-4">Source</th>
                </tr>
              </thead>
              <tbody>
                {filteredCards.slice(0, 10).map((card, index) => (
                  <tr key={card.id || index} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-3">
                        <span className="text-2xl">{card.image}</span>
                        <div>
                          <p className="font-medium">{card.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-lg font-bold">${card.price?.toFixed(2) || '0.00'}</span>
                    </td>
                    <td className="py-4 px-4">
                      <div className={`flex items-center ${card.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {card.change >= 0 ? (
                          <TrendingUp className="h-4 w-4 mr-1" />
                        ) : (
                          <TrendingDown className="h-4 w-4 mr-1" />
                        )}
                        <span>{card.change >= 0 ? '+' : ''}{card.change?.toFixed(1) || '0.0'}%</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="px-2 py-1 bg-blue-600/30 rounded-full text-sm">
                        {card.condition}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-sm text-gray-300">{card.rarity}</td>
                    <td className="py-4 px-4 text-sm text-gray-300">{card.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PokemonPriceDashboard;