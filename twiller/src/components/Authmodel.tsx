"use client";

import React, { useState, useEffect, useRef } from 'react';

import { X, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';

import LoadingSpinner from './loading-spinner';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Input } from './ui/input';
import AccessibleDialog from './ui/AccessibleDialog';
import { Separator } from './ui/separator';
import { useAuth } from '@/context/AuthContext';
import TwitterLogo from './Twitterlogo';
import { useRouter } from 'next/navigation';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'signup';
}

export default function AuthModal({ isOpen, onClose, initialMode = 'login' }: AuthModalProps) {
  const { login, signup, googlesignin, isLoading, otpPendingEmail, verifyOtp, cancelOtp, authError, retrySession } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [googleError, setGoogleError] = useState('');

  // Sync mode whenever the modal opens with a new initialMode
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setGoogleError('');
    }
  }, [isOpen, initialMode]);
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    username: '',
    displayName: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const closeModal = () => { void cancelOtp().catch(() => {}); onClose(); };

  if (!isOpen && !otpPendingEmail) return null;

  const handleGoogleSignIn = async () => {
    setGoogleError('');
    try {
      if (await googlesignin()) onClose();
    } catch (err: unknown) {
      setGoogleError(err instanceof Error ? err.message : 'Google sign-in failed');
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!formData.password.trim()) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (mode === 'signup') {
      if (!formData.username.trim()) {
        newErrors.username = 'Username is required';
      } else if (formData.username.length < 3) {
        newErrors.username = 'Username must be at least 3 characters';
      } else if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
        newErrors.username = 'Username can only contain letters, numbers, and underscores';
      }

      if (!formData.displayName.trim()) {
        newErrors.displayName = 'Display name is required';
      }
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length) {
      window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
    }
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || isLoading) return;

    try {
      const completed = mode === 'login'
        ? await login(formData.email, formData.password)
        : await signup(formData.email, formData.password, formData.username, formData.displayName);
      if (completed) onClose();
      setFormData({ email: '', password: '', username: '', displayName: '' });
      setErrors({});
    } catch (error: unknown) {
      setErrors({ general: error instanceof Error ? error.message : 'Authentication failed. Please try again.' });
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    setErrors({});
    setFormData({ email: '', password: '', username: '', displayName: '' });
  };

  if (otpPendingEmail) {
    return (
      <AccessibleDialog open onClose={closeModal} labelledBy="otp-dialog-title">
        <Card className="w-full max-w-md bg-black border-gray-800 text-white">
          <CardHeader className="relative pb-6">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close verification dialog"
              className="absolute right-4 top-4 text-white hover:bg-gray-900"
              onClick={closeModal}
            >
              <X className="h-5 w-5" />
            </Button>
            <div className="text-center">
              <div className="mb-6 flex justify-center">
                <TwitterLogo size="xl" className="text-white" />
              </div>
              <CardTitle id="otp-dialog-title" className="text-2xl font-bold">Verification Required</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <p id="otp-help" className="text-center text-gray-400">
              Enter the login code sent to your email to continue.
            </p>
            {(errors.general || authError) && <p id="otp-error" role="alert" className="text-red-400 text-sm">{errors.general || authError}</p>}
            <Button type="button" variant="link" disabled={isLoading} onClick={async () => { setErrors({}); try { await retrySession(); } catch { setErrors({ general: "Could not resend code. Please retry." }); } }}>Retry / resend expired code</Button>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-otp" className="text-white">Enter login code</Label>
                <Input
                  type="text"
                  id="login-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  aria-invalid={Boolean(errors.general || authError)}
                  aria-describedby={errors.general || authError ? "otp-help otp-error" : "otp-help"}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="bg-transparent border-gray-600 text-white placeholder-gray-400 focus:border-blue-500 text-center text-lg tracking-widest"
                  maxLength={6}
                  disabled={isLoading}
                />
              </div>
              <Button
                onClick={async () => {
                  try {
                    await verifyOtp(otp);
                    onClose();
                  } catch (err: unknown) {
                    setErrors({ general: err instanceof Error ? err.message : 'Invalid OTP. Please try again.' });
                  }
                }}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 rounded-full text-lg"
                disabled={isLoading || otp.length < 6}
              >
                {isLoading ? <LoadingSpinner size="sm" /> : "Verify OTP"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </AccessibleDialog>
    );
  }

  return (
    <AccessibleDialog open={isOpen} onClose={closeModal} labelledBy="auth-dialog-title">
      <Card className="w-full max-w-md bg-black border-gray-800 text-white">
        <CardHeader className="relative pb-6">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close sign-in dialog"
            className="absolute right-4 top-4 text-white hover:bg-gray-900"
            onClick={closeModal}
          >
            <X className="h-5 w-5" />
          </Button>
          <div className="text-center">
            <div className="mb-6 flex justify-center">
              <TwitterLogo size="xl" className="text-white" />
            </div>
            <CardTitle id="auth-dialog-title" className="text-2xl font-bold">
              {mode === 'login' ? 'Sign in to Twiller' : 'Create your account'}
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {(errors.general || authError) && (
            <div role="alert" className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-red-400 text-sm">
              {errors.general || authError}
            </div>
          )}

          <form ref={formRef} onSubmit={handleSubmit} aria-busy={isLoading} className="space-y-4">
            {mode === 'signup' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="displayName" className="text-white">Display Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                    <Input
                      id="displayName"
                      autoFocus={mode === 'signup'}
                      maxLength={50}
                      type="text"
                      required
                      aria-invalid={Boolean(errors.displayName)}
                      aria-describedby={errors.displayName ? "displayName-error" : undefined}
                      placeholder="Your display name"
                      value={formData.displayName}
                      onChange={(e) => handleInputChange('displayName', e.target.value)}
                      className="pl-10 bg-transparent border-gray-600 text-white placeholder-gray-400 focus:border-blue-500"
                      disabled={isLoading}
                    />
                  </div>
                  {errors.displayName && (
                    <p id="displayName-error" aria-live="polite" className="text-red-400 text-sm">{errors.displayName}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username" className="text-white">Username</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">@</span>
                    <Input
                      id="username"
                      maxLength={50}
                      type="text"
                      required
                      aria-invalid={Boolean(errors.username)}
                      aria-describedby={errors.username ? "username-error" : undefined}
                      placeholder="username"
                      value={formData.username}
                      onChange={(e) => handleInputChange('username', e.target.value)}
                      className="pl-8 bg-transparent border-gray-600 text-white placeholder-gray-400 focus:border-blue-500"
                      disabled={isLoading}
                    />
                  </div>
                  {errors.username && (
                    <p id="username-error" aria-live="polite" className="text-red-400 text-sm">{errors.username}</p>
                  )}
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-white">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                <Input
                  id="email"
                  maxLength={254}
                  type="email"
                  autoFocus={mode === 'login'}
                  autoComplete="email"
                  required
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className="pl-10 bg-transparent border-gray-600 text-white placeholder-gray-400 focus:border-blue-500"
                  disabled={isLoading}
                />
              </div>
              {errors.email && (
                <p id="email-error" aria-live="polite" className="text-red-400 text-sm">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-white">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? "password-error" : undefined}
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  className="pl-10 pr-10 bg-transparent border-gray-600 text-white placeholder-gray-400 focus:border-blue-500"
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {errors.password && (
                <p id="password-error" aria-live="polite" className="text-red-400 text-sm">{errors.password}</p>
              )}
            </div>

            {mode === 'login' && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => { onClose(); router.push('/forgot-password'); }}
                  className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 rounded-full text-lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <LoadingSpinner size="sm" />
                  <span>{mode === 'login' ? 'Signing in...' : 'Creating account...'}</span>
                </div>
              ) : (
                mode === 'login' ? 'Sign in' : 'Create account'
              )}
            </Button>
          </form>

          <div className="relative">
            <Separator className="bg-gray-700" />
            <span className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black px-2 text-gray-400 text-sm">
              OR
            </span>
          </div>

          {/* Google Sign In */}
          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="w-full border-gray-700 bg-black text-white hover:bg-gray-900 font-semibold py-3 rounded-full h-12 flex items-center justify-center gap-3"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {mode === 'login' ? 'Sign in with Google' : 'Sign up with Google'}
            </Button>
            {googleError && (
              <p className="text-red-400 text-xs text-center">{googleError}</p>
            )}
          </div>

          <div className="text-center">
            <p className="text-gray-400">
              {mode === 'login' ? "Don't have an account?" : "Already have an account?"}
              <Button
                variant="link"
                className="text-blue-400 hover:text-blue-300 font-semibold pl-1"
                onClick={switchMode}
                disabled={isLoading}
              >
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </Button>
            </p>
          </div>

          {mode === 'signup' && (
            <div className="text-center text-xs text-gray-500 leading-relaxed">
              By signing up, you agree to our{' '}
              <a href="/terms" className="text-blue-400 hover:underline">Terms of Service</a>
              {' '}and{' '}
              <a href="/privacy" className="text-blue-400 hover:underline">Privacy Policy</a>
              , including{' '}
              <a href="/cookies" className="text-blue-400 hover:underline">Cookie Use</a>.
            </div>
          )}
        </CardContent>
      </Card>
    </AccessibleDialog>
  );
}
