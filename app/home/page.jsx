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
  const wsRef = useRef(null);

  // WebSocket connection for real-time updates
  useEffect(() => {
    connectWebSocket();
    fetchInitialData();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const connectWebSocket = () => {
    try {
      wsRef.current = new WebSocket('ws://localhost:8080/ws');
      
      wsRef.current.onopen = () => {
        setConnected(true);
        console.log('WebSocket connected');
      };
      
      wsRef.current.onmessage = (event) => {
        const newCards = JSON.parse(event.data);
        setCards(newCards);
        setLastUpdate(new Date());
        showNotification('Price data updated!');
      };
      
      wsRef.current.onclose = () => {
        setConnected(false);
        console.log('WebSocket disconnected');
        // Reconnect after 5 seconds
        setTimeout(connectWebSocket, 5000);
      };
      
      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnected(false);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      setConnected(false);
    }
  };

  const fetchInitialData = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/cards');
      const data = await response.json();
      setCards(data || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
      // Use mock data as fallback
      setCards(mockCards);
    }
  };

  const showNotification = (message) => {
    // Create a notification element
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-pulse';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 3000);
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
 // this is jsut a hardcode template
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
    { name: 'Lightly Played', value: 22, color: '#F59E0B' },
    { name: 'Moderately Played', value: 15, color: '#EF4444' },
  ];

  const getTopCards = () => {
    const displayCards = filteredCards.length > 0 ? filteredCards : mockCards;
    return displayCards.sort((a, b) => b.price - a.price).slice(0, 6);
  };

  const getStats = () => {
    const displayCards = filteredCards.length > 0 ? filteredCards : mockCards;
    const avgPrice = displayCards.reduce((sum, card) => sum + card.price, 0) / displayCards.length;
    const topGainer = displayCards.reduce((max, card) => card.changePercent > max.changePercent ? card : max, displayCards[0]);
    const mostValuable = displayCards.reduce((max, card) => card.price > max.price ? card : max, displayCards[0]);
    
    return {
      avgPrice: avgPrice.toFixed(2),
      topGainer: topGainer?.name || 'N/A',
      topGainerChange: topGainer?.changePercent || 0,
      mostValuable: mostValuable?.price || 0,
      totalCards: displayCards.length
    };
  };

  const stats = getStats();

  const StatCard = ({ icon: Icon, title, value, change, color, subtitle }) => (
    <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl p-6 shadow-lg border border-gray-200 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 hover:scale-105">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600 text-sm font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
          {change !== undefined && (
            <div className="flex items-center mt-2">
              {change > 0 ? (
                <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
              )}
              <span className={`text-sm font-medium ${change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {change > 0 ? '+' : ''}{change}%
              </span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-full ${color} animate-pulse`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );

  const CardItem = ({ card, index }) => (
    <div 
      className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 border border-gray-200 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 hover:scale-102 cursor-pointer animate-fade-in"
      style={{ 
        animationDelay: `${index * 0.1}s`,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="text-2xl bg-white rounded-full w-12 h-12 flex items-center justify-center shadow-md animate-bounce">
            {card.image}
          </div>
          <div>
            <h3 className="font-semibold text-gray-800">{card.name}</h3>
            <p className="text-sm text-gray-600">{card.condition} • {card.rarity}</p>
            <p className="text-xs text-blue-600">{card.source}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-800">${card.price}</p>
          <div className="flex items-center">
            {card.changePercent > 0 ? (
              <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
            )}
            <span className={`text-sm font-medium ${card.changePercent > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {card.changePercent > 0 ? '+' : ''}{card.changePercent?.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 via-purple-50 to-pink-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl animate-spin mb-4">⚡</div>
          <p className="text-xl text-gray-600">Loading Pokemon card data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 via-purple-50 to-pink-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="text-3xl animate-bounce">⚡</div>
              <div>
                <h1 className="text-3xl font-bold">Pokémon Card Tracker</h1>
                <p className="text-blue-100">Real-time price monitoring & analytics</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                {connected ? <Wifi className="w-5 h-5 text-green-400" /> : <WifiOff className="w-5 h-5 text-red-400" />}
                <span className="text-sm">{connected ? 'Connected' : 'Disconnected'}</span>
              </div>
              <div className="text-sm text-blue-100">
                Last updated: {lastUpdate.toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            icon={DollarSign}
            title="Average Price"
            value={`$${stats.avgPrice}`}
            color="bg-green-500"
            subtitle="Across all cards"
          />
          <StatCard
            icon={TrendingUp}
            title="Top Gainer"
            value={stats.topGainer}
            change={stats.topGainerChange}
            color="bg-blue-500"
            subtitle="Best performer"
          />
          <StatCard
            icon={Award}
            title="Most Valuable"
            value={`$${stats.mostValuable}`}
            color="bg-purple-500"
            subtitle="Highest priced card"
          />
          <StatCard
            icon={Star}
            title="Total Cards"
            value={stats.totalCards}
            color="bg-orange-500"
            subtitle="In database"
          />
        </div>

        {/* Search and Filter Controls */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search cards..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-gray-600" />
              <select
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value)}
              >
                <option value="all">All Conditions</option>
                <option value="New">New</option>
                <option value="Near Mint">Near Mint</option>
                <option value="Lightly Played">Lightly Played</option>
                <option value="Moderately Played">Moderately Played</option>
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-gray-600" />
              <select
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={selectedTimeframe}
                onChange={(e) => setSelectedTimeframe(e.target.value)}
              >
                <option value="1M">1 Month</option>
                <option value="3M">3 Months</option>
                <option value="6M">6 Months</option>
                <option value="1Y">1 Year</option>
              </select>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Price Trends Chart */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-blue-600" />
              Price Trends
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={mockPriceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="charizard" stroke="#FF6B6B" strokeWidth={3} name="Charizard" />
                <Line type="monotone" dataKey="pikachu" stroke="#FFD93D" strokeWidth={3} name="Pikachu" />
                <Line type="monotone" dataKey="mew" stroke="#74C0FC" strokeWidth={3} name="Mew" />
                <Line type="monotone" dataKey="alakazam" stroke="#845EC2" strokeWidth={3} name="Alakazam" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Condition Distribution */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
              <Star className="w-5 h-5 mr-2 text-purple-600" />
              Card Conditions
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={conditionData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
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

        {/* Top Cards List */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
            <Award className="w-5 h-5 mr-2 text-orange-600" />
            Top Cards by Value
          </h2>
          <div className="space-y-4">
            {getTopCards().map((card, index) => (
              <CardItem key={card.id} card={card} index={index} />
            ))}
          </div>
        </div>
      </div>

      {/* Custom CSS for animations */}
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fade-in {
          animation: fade-in 0.5s ease-out both;
        }
      `}</style>
    </div>
  );
};

export default PokemonPriceDashboard;