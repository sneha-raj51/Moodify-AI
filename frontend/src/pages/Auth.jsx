import React, { useState } from 'react';
import { User, Mail, Lock, KeyRound, Loader, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { registerUser, loginUser, forgotPassword, resetPassword } from '../services/api.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Auth = ({ setUser, setCurrentView }) => {
  // mode: 'login' | 'signup' | 'forgot' | 'reset'
  const [mode, setMode] = useState('login');
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const resetMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const switchMode = (newMode) => {
    resetMessages();
    setMode(newMode);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    resetMessages();

    if (!email || !EMAIL_REGEX.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const data = await loginUser(email.trim(), password);
      localStorage.setItem('userInfo', JSON.stringify(data));
      setUser(data);
      setCurrentView('discover');
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    resetMessages();

    if (!name.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!email || !EMAIL_REGEX.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify both password fields.');
      return;
    }

    setLoading(true);
    try {
      const data = await registerUser(name.trim(), email.trim(), password);
      localStorage.setItem('userInfo', JSON.stringify(data));
      setUser(data);
      setCurrentView('discover');
    } catch (err) {
      setError(err.message || 'Registration failed. Email may already be in use.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    resetMessages();

    if (!email || !EMAIL_REGEX.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      const res = await forgotPassword(email.trim());
      setSuccess(res.message || 'If an account exists with this email, password reset instructions have been sent.');
    } catch (err) {
      setError(err.message || 'Failed to request password reset.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    resetMessages();

    if (!email || !EMAIL_REGEX.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!resetToken.trim()) {
      setError('Please enter the reset token.');
      return;
    }
    if (password.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await resetPassword(email.trim(), resetToken.trim(), password);
      setSuccess(res.message || 'Password reset successful! You can now log in.');
      setPassword('');
      setConfirmPassword('');
      setResetToken('');
      setTimeout(() => {
        switchMode('login');
      }, 2000);
    } catch (err) {
      setError(err.message || 'Failed to reset password. The token may be expired or invalid.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="bg-white rounded-3xl p-8 sm:p-10 max-w-md w-full border border-mood-black/10 shadow-2xl relative">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-mood-cobalt text-white flex items-center justify-center font-bold text-2xl shadow-lg shadow-mood-cobalt/25 mb-3">
            M
          </div>
          <h2 className="text-3xl font-extrabold text-mood-forest tracking-tight text-center">
            {mode === 'login' && 'Welcome Back'}
            {mode === 'signup' && 'Create Your Account'}
            {mode === 'forgot' && 'Reset Password'}
            {mode === 'reset' && 'Set New Password'}
          </h2>
          <p className="text-mood-black/60 text-sm text-center mt-2">
            {mode === 'login' && 'Sign in to access your mood history, playlists, and AI companion.'}
            {mode === 'signup' && 'Sign up to personalize your music experience and sync your tastes.'}
            {mode === 'forgot' && 'Enter your email to receive a secure password reset token.'}
            {mode === 'reset' && 'Enter your reset token and your new password.'}
          </p>
        </div>

        {/* Status Alerts */}
        {error && (
          <div className="bg-mood-sad/10 text-mood-sad p-3.5 rounded-2xl mb-5 text-sm font-semibold border border-mood-sad/20 flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="bg-emerald-500/10 text-emerald-700 p-3.5 rounded-2xl mb-5 text-sm font-semibold border border-emerald-500/20 flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-600" />
            <span>{success}</span>
          </div>
        )}

        {/* LOGIN FORM */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-mood-black/40">
                <Mail className="w-5 h-5" />
              </div>
              <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-mood-black/5 border border-transparent rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:bg-white focus:border-mood-cobalt/40 focus:ring-2 focus:ring-mood-cobalt/15 transition-all"
              />
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-mood-black/40">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-mood-black/5 border border-transparent rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:bg-white focus:border-mood-cobalt/40 focus:ring-2 focus:ring-mood-cobalt/15 transition-all"
              />
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="text-xs text-mood-cobalt font-semibold hover:underline"
              >
                Forgot Password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-mood-cobalt text-white py-3.5 rounded-xl font-bold hover:bg-mood-cobalt/90 transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-50 shadow-md shadow-mood-cobalt/20"
            >
              {loading ? <Loader className="w-5 h-5 animate-spin" /> : 'Sign In'}
              {!loading && <ArrowRight className="w-5 h-5" />}
            </button>

            <div className="mt-6 text-center text-sm text-mood-black/60 pt-4 border-t border-mood-black/5">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="text-mood-cobalt font-bold hover:underline"
              >
                Sign up
              </button>
            </div>
          </form>
        )}

        {/* SIGN UP FORM */}
        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-mood-black/40">
                <User className="w-5 h-5" />
              </div>
              <input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-mood-black/5 border border-transparent rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:bg-white focus:border-mood-cobalt/40 focus:ring-2 focus:ring-mood-cobalt/15 transition-all"
              />
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-mood-black/40">
                <Mail className="w-5 h-5" />
              </div>
              <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-mood-black/5 border border-transparent rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:bg-white focus:border-mood-cobalt/40 focus:ring-2 focus:ring-mood-cobalt/15 transition-all"
              />
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-mood-black/40">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type="password"
                placeholder="Password (min. 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-mood-black/5 border border-transparent rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:bg-white focus:border-mood-cobalt/40 focus:ring-2 focus:ring-mood-cobalt/15 transition-all"
              />
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-mood-black/40">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full bg-mood-black/5 border border-transparent rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:bg-white focus:border-mood-cobalt/40 focus:ring-2 focus:ring-mood-cobalt/15 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-mood-cobalt text-white py-3.5 rounded-xl font-bold hover:bg-mood-cobalt/90 transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-50 shadow-md shadow-mood-cobalt/20"
            >
              {loading ? <Loader className="w-5 h-5 animate-spin" /> : 'Create Account'}
              {!loading && <ArrowRight className="w-5 h-5" />}
            </button>

            <div className="mt-6 text-center text-sm text-mood-black/60 pt-4 border-t border-mood-black/5">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-mood-cobalt font-bold hover:underline"
              >
                Log in
              </button>
            </div>
          </form>
        )}

        {/* FORGOT PASSWORD FORM */}
        {mode === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-mood-black/40">
                <Mail className="w-5 h-5" />
              </div>
              <input
                type="email"
                placeholder="Your Registered Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-mood-black/5 border border-transparent rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:bg-white focus:border-mood-cobalt/40 focus:ring-2 focus:ring-mood-cobalt/15 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-mood-cobalt text-white py-3.5 rounded-xl font-bold hover:bg-mood-cobalt/90 transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-50 shadow-md shadow-mood-cobalt/20"
            >
              {loading ? <Loader className="w-5 h-5 animate-spin" /> : 'Send Reset Instructions'}
              {!loading && <ArrowRight className="w-5 h-5" />}
            </button>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => switchMode('reset')}
                className="text-xs text-mood-cobalt font-semibold hover:underline"
              >
                Already have a reset token? Enter reset token →
              </button>
            </div>

            <div className="mt-6 text-center text-sm text-mood-black/60 pt-4 border-t border-mood-black/5 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-mood-cobalt font-bold hover:underline flex items-center gap-1"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Log in
              </button>
            </div>
          </form>
        )}

        {/* RESET PASSWORD FORM */}
        {mode === 'reset' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-mood-black/40">
                <Mail className="w-5 h-5" />
              </div>
              <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-mood-black/5 border border-transparent rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:bg-white focus:border-mood-cobalt/40 focus:ring-2 focus:ring-mood-cobalt/15 transition-all"
              />
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-mood-black/40">
                <KeyRound className="w-5 h-5" />
              </div>
              <input
                type="text"
                placeholder="Reset Token"
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                required
                className="w-full bg-mood-black/5 border border-transparent rounded-xl py-3 pl-12 pr-4 text-sm font-mono focus:outline-none focus:bg-white focus:border-mood-cobalt/40 focus:ring-2 focus:ring-mood-cobalt/15 transition-all"
              />
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-mood-black/40">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type="password"
                placeholder="New Password (min. 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-mood-black/5 border border-transparent rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:bg-white focus:border-mood-cobalt/40 focus:ring-2 focus:ring-mood-cobalt/15 transition-all"
              />
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-mood-black/40">
                <Lock className="w-5 h-5" />
              </div>
              <input
                type="password"
                placeholder="Confirm New Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full bg-mood-black/5 border border-transparent rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:bg-white focus:border-mood-cobalt/40 focus:ring-2 focus:ring-mood-cobalt/15 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-mood-cobalt text-white py-3.5 rounded-xl font-bold hover:bg-mood-cobalt/90 transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-50 shadow-md shadow-mood-cobalt/20"
            >
              {loading ? <Loader className="w-5 h-5 animate-spin" /> : 'Set New Password'}
              {!loading && <ArrowRight className="w-5 h-5" />}
            </button>

            <div className="mt-6 text-center text-sm text-mood-black/60 pt-4 border-t border-mood-black/5 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="text-mood-cobalt font-bold hover:underline flex items-center gap-1"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Log in
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default Auth;
