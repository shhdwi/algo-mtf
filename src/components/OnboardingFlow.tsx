'use client';

import React, { useState } from 'react';
import { User, DollarSign, Settings, Key, CheckCircle, Loader2 } from 'lucide-react';

interface OnboardingStep {
  id: number;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 1,
    title: 'Account Setup',
    description: 'Create your trading account',
    icon: <User className="w-6 h-6" />
  },
  {
    id: 2,
    title: 'Capital & Risk',
    description: 'Set trading capital and risk preferences',
    icon: <DollarSign className="w-6 h-6" />
  },
  {
    id: 3,
    title: 'API Configuration',
    description: 'Connect your Lemon trading API',
    icon: <Key className="w-6 h-6" />
  },
  {
    id: 4,
    title: 'Trading Settings',
    description: 'Configure position limits and preferences',
    icon: <Settings className="w-6 h-6" />
  },
  {
    id: 5,
    title: 'Complete',
    description: 'Ready for automated trading',
    icon: <CheckCircle className="w-6 h-6" />
  }
];

export default function OnboardingFlow() {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [userToken, setUserToken] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    // Step 1: Account
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    phone_number: '',
    
    // Step 2: Capital & Risk
    total_capital: '',
    allocation_percentage: '',
    daily_loss_limit_percentage: '5',
    stop_loss_percentage: '2.5',
    
    // Step 3: API Configuration (Only 3 required fields)
    client_id: '',
    public_key: '',
    private_key: '',
    
    // Step 4: Trading Settings
    max_concurrent_positions: '10'
  });

  const formatCurrency = (amount: string) => {
    const num = parseFloat(amount);
    if (isNaN(num)) return '';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  const calculateAllocationAmount = () => {
    const capital = parseFloat(formData.total_capital);
    const allocation = parseFloat(formData.allocation_percentage);
    if (capital && allocation) {
      return (capital * allocation) / 100;
    }
    return 0;
  };

  // Check user's onboarding status on component mount
  const checkOnboardingStatus = async () => {
    try {
      setInitializing(true);
      
      // Check if user is logged in
      const token = localStorage.getItem('userToken');
      if (!token) {
        setInitializing(false);
        return; // Start from step 1 (registration)
      }

      setUserToken(token);

      // Check user's onboarding progress
      const response = await fetch('/api/onboarding/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        
        // Populate form with existing data
        if (data.user) {
          setFormData(prev => ({
            ...prev,
            email: data.user.email || '',
            full_name: data.user.full_name || '',
            phone_number: data.user.phone_number || ''
          }));
        }

        if (data.trading_preferences) {
          setFormData(prev => ({
            ...prev,
            total_capital: data.trading_preferences.total_capital?.toString() || '',
            allocation_percentage: data.trading_preferences.allocation_percentage?.toString() || '',
            daily_loss_limit_percentage: data.trading_preferences.daily_loss_limit_percentage?.toString() || '5',
            stop_loss_percentage: data.trading_preferences.stop_loss_percentage?.toString() || '2.5',
            max_concurrent_positions: data.trading_preferences.max_concurrent_positions?.toString() || '10'
          }));
        }

        if (data.api_credentials) {
          setFormData(prev => ({
            ...prev,
            client_id: data.api_credentials.client_id || ''
          }));
        }

        // Determine which step to start from
        if (data.onboarding_complete) {
          setCurrentStep(5); // Already complete
        } else if (data.api_credentials?.client_id) {
          setCurrentStep(4); // Has API, go to final settings
        } else if (data.trading_preferences?.total_capital) {
          setCurrentStep(3); // Has preferences, needs API
        } else if (data.user) {
          setCurrentStep(2); // User exists, needs preferences
        } else {
          setCurrentStep(1); // Start from registration
        }
      } else {
        // Invalid token, start from registration
        localStorage.removeItem('userToken');
        setCurrentStep(1);
      }
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      setCurrentStep(1);
    } finally {
      setInitializing(false);
    }
  };

  // Run status check on mount
  React.useEffect(() => {
    checkOnboardingStatus();
  }, []);

  const handleSubmitStep = async () => {
    setLoading(true);
    
    try {
      if (currentStep === 1) {
        // Register user
        if (formData.password !== formData.confirmPassword) {
          alert('Passwords do not match');
          setLoading(false);
          return;
        }

        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            full_name: formData.full_name,
            phone_number: formData.phone_number
          })
        });

        const result = await response.json();
        if (result.success) {
          // Auto-login after registration
          const loginResponse = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: formData.email,
              password: formData.password
            })
          });

          const loginResult = await loginResponse.json();
          if (loginResult.success) {
            localStorage.setItem('userToken', loginResult.token);
            setUserToken(loginResult.token);
            setCurrentStep(2);
          } else {
            alert('Registration successful, but login failed. Please try logging in manually.');
          }
        } else {
          alert(result.error);
        }
      } else if (currentStep === 4) {
        // Complete onboarding - save all settings
        if (!userToken) {
          alert('Authentication required. Please start over.');
          setCurrentStep(1);
          setLoading(false);
          return;
        }

        const setupResponse = await fetch('/api/onboarding/trading-setup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userToken}`
          },
          body: JSON.stringify({
            total_capital: parseFloat(formData.total_capital),
            allocation_percentage: parseFloat(formData.allocation_percentage),
            max_concurrent_positions: parseInt(formData.max_concurrent_positions),
            daily_loss_limit_percentage: parseFloat(formData.daily_loss_limit_percentage),
            stop_loss_percentage: parseFloat(formData.stop_loss_percentage),
            client_id: formData.client_id,
            public_key: formData.public_key,
            private_key: formData.private_key
          })
        });

        const setupResult = await setupResponse.json();
        if (setupResult.success) {
          setCurrentStep(5);
        } else {
          alert(setupResult.error);
        }
      } else {
        setCurrentStep(currentStep + 1);
      }
    } catch (error) {
      console.error('Error submitting step:', error);
      alert('An error occurred. Please try again.');
    }
    
    setLoading(false);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-900">Create Your Account</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-3">Full Name</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                  className="w-full px-5 py-4 border-2 border-slate-200 rounded-xl bg-white/80 backdrop-blur-sm focus:ring-3 focus:ring-emerald-200 focus:border-emerald-400 transition-all duration-200 text-slate-900 placeholder-slate-400 shadow-sm hover:border-emerald-300"
                  placeholder="Enter your full name"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-3">Phone Number</label>
                <div className="relative">
                  <div className="absolute left-5 top-1/2 transform -translate-y-1/2 text-slate-600 font-medium">+91</div>
                  <input
                    type="tel"
                    value={formData.phone_number}
                    onChange={(e) => setFormData({...formData, phone_number: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                    className="w-full pl-16 pr-5 py-4 border-2 border-slate-200 rounded-xl bg-white/80 backdrop-blur-sm focus:ring-3 focus:ring-emerald-200 focus:border-emerald-400 transition-all duration-200 text-slate-900 placeholder-slate-400 shadow-sm hover:border-emerald-300 text-lg font-medium"
                    placeholder="9876543210"
                    maxLength={10}
                  />
                </div>
                <p className="text-xs text-emerald-600 mt-2 font-medium">
                  📱 WhatsApp trading alerts will be sent to +91{formData.phone_number || 'XXXXXXXXXX'}
                </p>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-800 mb-3">Email Address</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full px-5 py-4 border-2 border-slate-200 rounded-xl bg-white/80 backdrop-blur-sm focus:ring-3 focus:ring-emerald-200 focus:border-emerald-400 transition-all duration-200 text-slate-900 placeholder-slate-400 shadow-sm hover:border-emerald-300"
                  placeholder="your.email@example.com"
                />
                <p className="text-xs text-slate-500 mt-2">Used for login and important trading updates</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-3">Password</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="w-full px-5 py-4 border-2 border-slate-200 rounded-xl bg-white/80 backdrop-blur-sm focus:ring-3 focus:ring-emerald-200 focus:border-emerald-400 transition-all duration-200 text-slate-900 placeholder-slate-400 shadow-sm hover:border-emerald-300"
                  placeholder="Minimum 8 characters"
                />
                <p className="text-xs text-slate-500 mt-2">Strong password recommended for security</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-3">Confirm Password</label>
                <input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                  className="w-full px-5 py-4 border-2 border-slate-200 rounded-xl bg-white/80 backdrop-blur-sm focus:ring-3 focus:ring-emerald-200 focus:border-emerald-400 transition-all duration-200 text-slate-900 placeholder-slate-400 shadow-sm hover:border-emerald-300"
                  placeholder="Confirm your password"
                />
                <p className="text-xs text-slate-500 mt-2">Must match the password above</p>
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-900">Trading Capital & Risk Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-3">Total Trading Capital</label>
                <input
                  type="number"
                  value={formData.total_capital}
                  onChange={(e) => setFormData({...formData, total_capital: e.target.value})}
                  className="w-full px-5 py-4 border-2 border-slate-200 rounded-xl bg-white/80 backdrop-blur-sm focus:ring-3 focus:ring-emerald-200 focus:border-emerald-400 transition-all duration-200 text-slate-900 placeholder-slate-400 shadow-sm hover:border-emerald-300 text-lg font-medium"
                  placeholder="500000"
                />
                <p className="text-sm font-medium text-emerald-600 mt-2">
                  {formData.total_capital ? formatCurrency(formData.total_capital) : 'Enter amount in rupees (minimum ₹10,000)'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-3">Allocation per Trade (%)</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={formData.allocation_percentage}
                  onChange={(e) => setFormData({...formData, allocation_percentage: e.target.value})}
                  className="w-full px-5 py-4 border-2 border-slate-200 rounded-xl bg-white/80 backdrop-blur-sm focus:ring-3 focus:ring-emerald-200 focus:border-emerald-400 transition-all duration-200 text-slate-900 placeholder-slate-400 shadow-sm hover:border-emerald-300 text-lg font-medium"
                  placeholder="10"
                />
                <p className="text-sm font-medium text-emerald-600 mt-2">
                  {calculateAllocationAmount() ? `${formatCurrency(calculateAllocationAmount().toString())} per trade` : 'Percentage of capital per position (1-50%)'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-3">Daily Loss Limit (%)</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={formData.daily_loss_limit_percentage}
                  onChange={(e) => setFormData({...formData, daily_loss_limit_percentage: e.target.value})}
                  className="w-full px-5 py-4 border-2 border-slate-200 rounded-xl bg-white/80 backdrop-blur-sm focus:ring-3 focus:ring-rose-200 focus:border-rose-400 transition-all duration-200 text-slate-900 placeholder-slate-400 shadow-sm hover:border-rose-300 text-lg font-medium"
                />
                <p className="text-sm font-medium text-rose-600 mt-2">Stop trading if daily loss exceeds this % of total capital</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-3">Stop Loss per Trade (%)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={formData.stop_loss_percentage}
                  onChange={(e) => setFormData({...formData, stop_loss_percentage: e.target.value})}
                  className="w-full px-5 py-4 border-2 border-slate-200 rounded-xl bg-white/80 backdrop-blur-sm focus:ring-3 focus:ring-rose-200 focus:border-rose-400 transition-all duration-200 text-slate-900 placeholder-slate-400 shadow-sm hover:border-rose-300 text-lg font-medium"
                />
                <p className="text-sm font-medium text-rose-600 mt-2">Maximum loss per individual position</p>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 mb-2">Connect Your Trading API</h2>
              <p className="text-lg text-slate-600">Enter your Lemon API credentials to enable real trading</p>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-3">
                  Client ID <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.client_id}
                  onChange={(e) => setFormData({...formData, client_id: e.target.value})}
                  className="w-full px-6 py-4 border-2 border-slate-300 rounded-2xl bg-white focus:ring-4 focus:ring-blue-200 focus:border-blue-400 transition-all duration-200 text-slate-900 placeholder-slate-500 shadow-lg hover:border-blue-300 font-mono text-lg"
                  placeholder="CLIENT123"
                  required
                />
                <p className="text-sm font-medium text-blue-600 mt-2">
                  🆔 Your unique client identifier from Lemon API
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 mb-3">
                  API Public Key <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.public_key}
                  onChange={(e) => setFormData({...formData, public_key: e.target.value})}
                  className="w-full px-6 py-4 border-2 border-slate-300 rounded-2xl bg-white focus:ring-4 focus:ring-green-200 focus:border-green-400 transition-all duration-200 text-slate-900 placeholder-slate-500 shadow-lg hover:border-green-300 font-mono"
                  placeholder="Enter your Lemon API public key"
                  required
                />
                <p className="text-sm font-medium text-green-600 mt-2">
                  🔑 Your Lemon API public key (will be validated with live API test)
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 mb-3">
                  API Private Key <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  value={formData.private_key}
                  onChange={(e) => setFormData({...formData, private_key: e.target.value})}
                  className="w-full px-6 py-4 border-2 border-slate-300 rounded-2xl bg-white focus:ring-4 focus:ring-purple-200 focus:border-purple-400 transition-all duration-200 text-slate-900 placeholder-slate-500 shadow-lg hover:border-purple-300 font-mono"
                  placeholder="Enter your Lemon API private key"
                  required
                />
                <p className="text-sm font-medium text-purple-600 mt-2">
                  🔐 Your Lemon API private key (will be tested for authentication)
                </p>
              </div>
            </div>

            <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border-2 border-blue-200 rounded-2xl p-8 shadow-xl">
              <h3 className="font-bold text-slate-900 mb-4 text-xl flex items-center">
                🛡️ What We Use These For
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                <div className="text-center p-4 bg-white/70 rounded-xl border border-blue-100">
                  <div className="text-2xl mb-2">🆔</div>
                  <p className="font-semibold text-slate-800">Client ID</p>
                  <p className="text-slate-600 mt-1">Authentication identifier</p>
                </div>
                <div className="text-center p-4 bg-white/70 rounded-xl border border-green-100">
                  <div className="text-2xl mb-2">🔑</div>
                  <p className="font-semibold text-slate-800">Public Key</p>
                  <p className="text-slate-600 mt-1">API access authentication</p>
                </div>
                <div className="text-center p-4 bg-white/70 rounded-xl border border-purple-100">
                  <div className="text-2xl mb-2">🔐</div>
                  <p className="font-semibold text-slate-800">Private Key</p>
                  <p className="text-slate-600 mt-1">Secure signature generation</p>
                </div>
              </div>
              
              <div className="mt-6 p-4 bg-emerald-100 border border-emerald-300 rounded-xl">
                <p className="text-sm font-semibold text-emerald-800 flex items-center">
                  🔒 <span className="ml-2">All keys are encrypted with AES-256 and never stored in plain text</span>
                </p>
              </div>
              
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-sm text-amber-800">
                  <strong>📋 How to get these:</strong> Generate API keys from your Lemon/broker dashboard → Developer/API section → Generate new API key pair
                </p>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-900">Trading Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-3">Maximum Concurrent Positions</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={formData.max_concurrent_positions}
                  onChange={(e) => setFormData({...formData, max_concurrent_positions: e.target.value})}
                  className="w-full px-5 py-4 border-2 border-slate-200 rounded-xl bg-white/80 backdrop-blur-sm focus:ring-3 focus:ring-emerald-200 focus:border-emerald-400 transition-all duration-200 text-slate-900 placeholder-slate-400 shadow-sm hover:border-emerald-300 text-lg font-medium"
                />
                <p className="text-sm font-medium text-emerald-600 mt-2">Maximum number of positions held simultaneously</p>
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border-2 border-emerald-200 rounded-2xl p-8 shadow-xl">
              <h3 className="font-bold text-slate-900 mb-6 text-xl">📊 Your Trading Configuration</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="text-center p-4 bg-white/60 rounded-xl border border-emerald-100">
                  <p className="text-xs font-medium text-slate-600 uppercase tracking-wider mb-2">Total Capital</p>
                  <p className="font-bold text-lg text-slate-900">{formatCurrency(formData.total_capital)}</p>
                </div>
                <div className="text-center p-4 bg-white/60 rounded-xl border border-emerald-100">
                  <p className="text-xs font-medium text-slate-600 uppercase tracking-wider mb-2">Per Trade</p>
                  <p className="font-bold text-lg text-emerald-600">{formatCurrency(calculateAllocationAmount().toString())}</p>
                  <p className="text-xs text-emerald-500 mt-1">{formData.allocation_percentage}%</p>
                </div>
                <div className="text-center p-4 bg-white/60 rounded-xl border border-rose-100">
                  <p className="text-xs font-medium text-slate-600 uppercase tracking-wider mb-2">Daily Loss Limit</p>
                  <p className="font-bold text-lg text-rose-600">{formData.daily_loss_limit_percentage}%</p>
                  <p className="text-xs text-rose-500 mt-1">{formatCurrency((parseFloat(formData.total_capital || '0') * parseFloat(formData.daily_loss_limit_percentage) / 100).toString())}</p>
                </div>
                <div className="text-center p-4 bg-white/60 rounded-xl border border-slate-100">
                  <p className="text-xs font-medium text-slate-600 uppercase tracking-wider mb-2">Max Positions</p>
                  <p className="font-bold text-lg text-slate-900">{formData.max_concurrent_positions}</p>
                  <p className="text-xs text-slate-500 mt-1">Concurrent</p>
                </div>
              </div>
              <div className="mt-6 p-4 bg-emerald-100 border border-emerald-300 rounded-xl">
                <p className="text-sm font-medium text-emerald-800">
                  🎯 <strong>Ready for automated trading:</strong> System will automatically place orders when signals are found and manage exits with trailing stops.
                </p>
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-slate-900">Welcome to Real Trading! 🎉</h2>
            <p className="text-lg text-slate-600">
              Your account is now set up for automated trading with real money.
            </p>
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-6">
              <h3 className="font-semibold text-slate-900 mb-4">What happens next:</h3>
              <ul className="text-left space-y-2 text-slate-700">
                <li>🕒 <strong>3:15 PM IST</strong> - Daily scan will find entry signals and place real orders</li>
                <li>⚡ <strong>Every 5 minutes</strong> - System monitors positions and executes exits</li>
                <li>📱 <strong>WhatsApp alerts</strong> - You'll receive notifications for all trading activity</li>
                <li>📊 <strong>Dashboard access</strong> - Track your real trading performance</li>
              </ul>
            </div>
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="px-8 py-4 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-600 hover:via-teal-600 hover:to-cyan-600 text-white font-semibold rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105"
            >
              Go to Dashboard
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  // Show loading while checking onboarding status
  if (initializing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-emerald-500 mx-auto mb-4" />
          <p className="text-lg font-medium text-slate-700">Checking your onboarding status...</p>
          <p className="text-sm text-slate-500 mt-2">Please wait while we load your information</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
      {/* Progress Bar */}
      <div className="bg-white/90 backdrop-blur-sm shadow-xl border-b border-emerald-200 py-4">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between">
            {ONBOARDING_STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                  currentStep > step.id 
                    ? 'bg-emerald-500 border-emerald-500 text-white' 
                    : currentStep === step.id
                    ? 'bg-white border-emerald-500 text-emerald-500'
                    : 'bg-gray-100 border-gray-300 text-gray-400'
                }`}>
                  {currentStep > step.id ? <CheckCircle className="w-5 h-5" /> : step.icon}
                </div>
                {index < ONBOARDING_STEPS.length - 1 && (
                  <div className={`w-16 h-1 mx-2 ${
                    currentStep > step.id ? 'bg-emerald-500' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 text-center">
            <h1 className="text-lg font-semibold text-slate-900">
              {ONBOARDING_STEPS[currentStep - 1]?.title}
            </h1>
            <p className="text-sm text-slate-600">
              {ONBOARDING_STEPS[currentStep - 1]?.description}
            </p>
            {userToken && currentStep > 1 && (
              <div className="mt-2 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium inline-block">
                👋 Welcome back! Continuing your setup...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Step Content */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-emerald-100 p-8">
          {renderStepContent()}
          
          {currentStep < 5 && (
            <div className="flex justify-between mt-10">
              <button
                onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
                disabled={currentStep === 1}
                className="px-8 py-4 border-2 border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 hover:border-slate-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 font-medium shadow-sm"
              >
                ← Previous
              </button>
              <button
                onClick={handleSubmitStep}
                disabled={loading}
                className="px-10 py-4 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-600 hover:via-teal-600 hover:to-cyan-600 text-white font-bold rounded-xl shadow-xl transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
              >
                {loading ? (
                  <span className="flex items-center">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Processing...
                  </span>
                ) : currentStep === 4 ? '🚀 Complete Setup' : 'Next →'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

