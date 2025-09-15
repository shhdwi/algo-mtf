'use client';

import { useState } from 'react';
import { User, DollarSign, Settings, Key, CheckCircle } from 'lucide-react';

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
    
    // Step 3: API Configuration
    api_setup_method: 'existing', // 'existing' or 'generate'
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
          setCurrentStep(2);
        } else {
          alert(result.error);
        }
      } else if (currentStep === 4) {
        // Complete onboarding - save all settings
        const loginResponse = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password
          })
        });

        const loginResult = await loginResponse.json();
        if (!loginResult.success) {
          alert('Login failed');
          setLoading(false);
          return;
        }

        const setupResponse = await fetch('/api/onboarding/trading-setup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${loginResult.token}`
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
                <label className="block text-sm font-medium text-slate-700 mb-2">Full Name</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                  className="w-full px-4 py-3 border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Enter your full name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Phone Number</label>
                <input
                  type="tel"
                  value={formData.phone_number}
                  onChange={(e) => setFormData({...formData, phone_number: e.target.value})}
                  className="w-full px-4 py-3 border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="10-digit mobile number"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">Email Address</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full px-4 py-3 border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="your.email@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="w-full px-4 py-3 border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Minimum 8 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Confirm Password</label>
                <input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                  className="w-full px-4 py-3 border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Confirm your password"
                />
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
                <label className="block text-sm font-medium text-slate-700 mb-2">Total Trading Capital</label>
                <input
                  type="number"
                  value={formData.total_capital}
                  onChange={(e) => setFormData({...formData, total_capital: e.target.value})}
                  className="w-full px-4 py-3 border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="500000"
                />
                <p className="text-sm text-slate-600 mt-1">
                  {formData.total_capital ? formatCurrency(formData.total_capital) : 'Enter amount in rupees'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Allocation per Trade (%)</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={formData.allocation_percentage}
                  onChange={(e) => setFormData({...formData, allocation_percentage: e.target.value})}
                  className="w-full px-4 py-3 border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="10"
                />
                <p className="text-sm text-slate-600 mt-1">
                  {calculateAllocationAmount() ? `${formatCurrency(calculateAllocationAmount().toString())} per trade` : 'Amount per position'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Daily Loss Limit (%)</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={formData.daily_loss_limit_percentage}
                  onChange={(e) => setFormData({...formData, daily_loss_limit_percentage: e.target.value})}
                  className="w-full px-4 py-3 border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                <p className="text-sm text-slate-600 mt-1">Stop trading if daily loss exceeds this %</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Stop Loss per Trade (%)</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={formData.stop_loss_percentage}
                  onChange={(e) => setFormData({...formData, stop_loss_percentage: e.target.value})}
                  className="w-full px-4 py-3 border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                <p className="text-sm text-slate-600 mt-1">Maximum loss per position</p>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-900">API Configuration</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Client ID</label>
                  <input
                    type="text"
                    value={formData.client_id}
                    onChange={(e) => setFormData({...formData, client_id: e.target.value})}
                    className="w-full px-4 py-3 border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="CLIENT123"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Public Key</label>
                  <input
                    type="text"
                    value={formData.public_key}
                    onChange={(e) => setFormData({...formData, public_key: e.target.value})}
                    className="w-full px-4 py-3 border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="pk_live_..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Private Key</label>
                  <input
                    type="password"
                    value={formData.private_key}
                    onChange={(e) => setFormData({...formData, private_key: e.target.value})}
                    className="w-full px-4 py-3 border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="sk_live_..."
                  />
                </div>
              </div>
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-6">
                <h3 className="font-semibold text-slate-900 mb-2">🔐 Security Notice</h3>
                <p className="text-sm text-slate-600">
                  Your API keys are encrypted and stored securely. We never store your private key in plain text.
                  Make sure you have your Lemon API keys ready from your broker account.
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
                <label className="block text-sm font-medium text-slate-700 mb-2">Maximum Concurrent Positions</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={formData.max_concurrent_positions}
                  onChange={(e) => setFormData({...formData, max_concurrent_positions: e.target.value})}
                  className="w-full px-4 py-3 border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                <p className="text-sm text-slate-600 mt-1">Maximum number of positions at one time</p>
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-6">
              <h3 className="font-semibold text-slate-900 mb-4">📊 Trading Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-slate-600">Total Capital</p>
                  <p className="font-bold text-slate-900">{formatCurrency(formData.total_capital)}</p>
                </div>
                <div>
                  <p className="text-slate-600">Per Trade</p>
                  <p className="font-bold text-emerald-600">{formatCurrency(calculateAllocationAmount().toString())}</p>
                </div>
                <div>
                  <p className="text-slate-600">Daily Loss Limit</p>
                  <p className="font-bold text-rose-600">{formData.daily_loss_limit_percentage}%</p>
                </div>
                <div>
                  <p className="text-slate-600">Max Positions</p>
                  <p className="font-bold text-slate-900">{formData.max_concurrent_positions}</p>
                </div>
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
          </div>
        </div>
      </div>

      {/* Step Content */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-emerald-100 p-8">
          {renderStepContent()}
          
          {currentStep < 5 && (
            <div className="flex justify-between mt-8">
              <button
                onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
                disabled={currentStep === 1}
                className="px-6 py-3 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={handleSubmitStep}
                disabled={loading}
                className="px-8 py-3 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-600 hover:via-teal-600 hover:to-cyan-600 text-white font-semibold rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : currentStep === 4 ? 'Complete Setup' : 'Next'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
