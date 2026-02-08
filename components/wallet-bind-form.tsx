'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { usePortfolio } from '@/context/portfolio-context';
import { getUserIdByAddress, fetchAllPositions, enrichPositions } from '@/lib/sodex-api';
import { cacheManager } from '@/lib/cache';

export function WalletBindForm() {
  const [address, setAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const { setWalletAddress } = usePortfolio();

  const handleBind = async () => {
    if (!address.trim()) {
      setError('Please enter a wallet address');
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatus(null);

    try {
      // Clear any cached data for this user to ensure fresh data
      cacheManager.clear();
      console.log('[v0] Cleared cache before binding new address');
      
      // Step 1: Get userId from address
      setStatus('Looking up your account...');
      const userId = await getUserIdByAddress(address.trim());
      console.log('[v0] Found userId:', userId);

      // Step 2: Fetch positions
      setStatus('Fetching your positions...');
      const positions = await fetchAllPositions(userId);
      console.log('[v0] Fetched positions:', positions.length);

      // Step 3: Enrich positions with symbol data
      setStatus('Processing your data...');
      const enrichedPositions = await enrichPositions(positions);
      console.log('[v0] Enriched positions:', enrichedPositions.length);

      // Step 4: Save to portfolio context
      setStatus('Saving your account...');
      await setWalletAddress(address.trim(), userId, enrichedPositions);
      
      console.log('[v0] Successfully bound account');
      setStatus('Account bound successfully!');
      setAddress('');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to bind address';
      console.error('[v0] Bind error:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setAddress(text);
      setError(null);
    } catch (err) {
      setError('Failed to read clipboard');
    }
  };

  return (
    <Card className="p-8 bg-card border border-border max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-foreground mb-2">Bind Your Trading Account</h2>
      <p className="text-muted-foreground mb-6">Enter your wallet address to load your position history and trading data</p>

      <div className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Enter wallet address (0x...)"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setError(null);
            }}
            disabled={isLoading}
            className="bg-input border-border flex-1"
          />
          <Button variant="outline" onClick={handlePaste} disabled={isLoading} size="sm">
            Paste
          </Button>
        </div>

        {status && <p className="text-sm text-blue-400 font-medium">{status}</p>}
        {error && <p className="text-sm text-red-500 font-medium">{error}</p>}

        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleBind}
            disabled={isLoading || !address.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isLoading ? 'Loading...' : 'Bind Account'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
