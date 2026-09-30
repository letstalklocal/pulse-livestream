import React from 'react';
import { CoinStoreContent } from '@/components/CoinStoreContent';
import { useAuth } from '@/context/AuthContext';
import { Redirect } from 'expo-router';

export default function CoinStoreScreen() {
  const { isLoaded, user } = useAuth();
  if (isLoaded && !user) return <Redirect href="/(tabs)/profile" />;
  return <CoinStoreContent />;
}
