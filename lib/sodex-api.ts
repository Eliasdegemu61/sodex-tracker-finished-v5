// API service for Sodex protocol data

import { cacheManager } from './cache';
import { lookupWalletAddress } from './client-api';

interface PositionData {
  account_id: number;
  position_id: number;
  user_id: number;
  symbol_id: number;
  margin_mode: number; // 1 = ISOLATED, 2 = CROSS
  position_side: number; // 2 = LONG, 3 = SHORT
  size: string;
  initial_margin: string;
  avg_entry_price: string;
  cum_open_cost: string;
  cum_trading_fee: string;
  cum_closed_size: string;
  avg_close_price: string;
  max_size: string;
  realized_pnl: string;
  frozen_size: string;
  leverage: number;
  active: boolean;
  is_taken_over: boolean;
  take_over_price: string;
  created_at: number;
  updated_at: number;
}

interface SymbolData {
  symbolID: number;
  name: string;
  baseCoin: string;
  quoteCoin?: string;
  [key: string]: unknown;
}

interface PositionsResponse {
  code: number;
  message: string;
  data: PositionData[];
  next_cursor?: string;
}

interface SymbolsResponse {
  code: number;
  timestamp: number;
  data: Record<string, SymbolData>;
}

// Use server-side endpoint for wallet lookup
export async function getUserIdByAddress(address: string): Promise<string> {
  return lookupWalletAddress(address);
}

export async function fetchPositions(
  accountId: string | number,
  cursor?: string
): Promise<{ positions: PositionData[]; nextCursor?: string }> {
  const url = new URL('https://mainnet-data.sodex.dev/api/v1/perps/positions');
  url.searchParams.append('account_id', String(accountId));
  url.searchParams.append('limit', '1000');
  if (cursor) {
    url.searchParams.append('cursor', cursor);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to fetch positions: ${response.statusText}`);
  }

  const data: PositionsResponse = await response.json();
  if (data.code !== 0) {
    throw new Error(`API error: ${data.message}`);
  }

  return {
    positions: data.data || [],
    nextCursor: data.next_cursor,
  };
}

export async function fetchAllPositions(
  accountId: string | number
): Promise<PositionData[]> {
  const allPositions: PositionData[] = [];
  let cursor: string | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { positions, nextCursor } = await fetchPositions(accountId, cursor);
    allPositions.push(...positions);

    if (!nextCursor) {
      break;
    }
    cursor = nextCursor;
  }

  return allPositions;
}

export async function fetchSymbols(): Promise<Map<number, SymbolData>> {
  const response = await fetch('https://mainnet-gw.sodex.dev/bolt/symbols?names');
  if (!response.ok) {
    throw new Error(`Failed to fetch symbols: ${response.statusText}`);
  }

  const data: SymbolsResponse = await response.json();
  if (data.code !== 0) {
    throw new Error(`API error retrieving symbols`);
  }

  const symbolMap = new Map<number, SymbolData>();
  for (const symbol of Object.values(data.data)) {
    symbolMap.set(symbol.symbolID, symbol);
  }

  return symbolMap;
}

export interface EnrichedPosition extends PositionData {
  pairName: string;
  marginModeLabel: string;
  positionSideLabel: string;
  realizedPnlValue: number;
  tradingFee: number;
  closedSize: number;
  createdAtFormatted: string;
}

export async function enrichPositions(
  positions: PositionData[]
): Promise<EnrichedPosition[]> {
  const symbolMap = await fetchSymbols();

  return positions
    .filter((position) => {
      // Only include positions that were closed (have close price and closed size)
      const closedSize = parseFloat(position.cum_closed_size || '0');
      const closePrice = parseFloat(position.avg_close_price || '0');
      return closedSize > 0 && closePrice > 0;
    })
    .map((position) => {
      const symbol = symbolMap.get(position.symbol_id);
      const pairName = symbol?.name || `SYMBOL_${position.symbol_id}`;
      const marginModeLabel = position.margin_mode === 1 ? 'ISOLATED' : 'CROSS';
      
      // Handle position_side: 2 = LONG, 3 = SHORT (can be string or number)
      const positionSideValue = typeof position.position_side === 'string' 
        ? parseInt(position.position_side) 
        : position.position_side;
      const positionSideLabel = positionSideValue === 2 ? 'LONG' : positionSideValue === 3 ? 'SHORT' : 'UNKNOWN';
      
      const realizedPnlValue = parseFloat(position.realized_pnl || '0');
      const tradingFee = parseFloat(position.cum_trading_fee || '0');
      const closedSize = parseFloat(position.cum_closed_size || '0');
      const createdAtFormatted = new Date(position.created_at).toLocaleString();

      console.log('[v0] Enriching position:', {
        pairName,
        closedSize,
        realizedPnlValue,
        tradingFee,
        position_side: positionSideValue,
        positionSideLabel,
      });

      return {
        ...position,
        pairName,
        marginModeLabel,
        positionSideLabel,
        realizedPnlValue,
        tradingFee,
        closedSize,
        createdAtFormatted,
      };
    });
}

export interface OpenPositionData {
  symbol: string;
  positionId: string;
  contractType: string;
  positionType: string;
  positionSide: string; // LONG or SHORT
  positionSize: string;
  entryPrice: string;
  liquidationPrice: string;
  isolatedMargin: string;
  leverage: number;
  unrealizedProfit: string;
  realizedProfit: string;
  cumTradingFee: string;
  createdTime: number;
  updatedTime: number;
}

export interface BalanceData {
  coin: string;
  walletBalance: string;
  openOrderMarginFrozen: string;
  availableBalance: string;
}

export interface AccountDetailsData {
  positions: OpenPositionData[];
  balances: BalanceData[];
  isolatedMargin: string;
  crossMargin: string;
  availableMarginForIsolated: string;
  availableMarginForCross: string;
}

export interface AccountDetailsResponse {
  code: number;
  timestamp: number;
  data: AccountDetailsData;
}

export async function fetchAccountDetails(userId: string | number): Promise<AccountDetailsData> {
  const cacheKey = `accountDetails_${userId}`;
  
  return cacheManager.deduplicate(cacheKey, async () => {
    const url = `https://mainnet-gw.sodex.dev/futures/fapi/user/v1/public/account/details?accountId=${userId}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch account details: ${response.statusText}`);
    }

    const data: AccountDetailsResponse = await response.json();
    if (data.code !== 0) {
      throw new Error(`API error: Failed to fetch account details`);
    }

    console.log('[v0] Fetched account details - positions:', data.data.positions.length, 'balance:', data.data.balances[0]?.walletBalance);
    return data.data;
  });
}

export async function fetchOpenPositions(userId: string | number): Promise<OpenPositionData[]> {
  const accountData = await fetchAccountDetails(userId);
  return accountData.positions || [];
}

export interface SpotBalance {
  coin: string;
  balance: string;
  availableBalance: string;
}

export interface SpotBalanceResponse {
  code: number;
  data: {
    spotBalance: SpotBalance[];
    totalUsdtAmount: number;
  };
}

export async function fetchSpotBalance(userId: string | number): Promise<SpotBalance[]> {
  const cacheKey = `spotBalance_${userId}`;
  
  return cacheManager.deduplicate(cacheKey, async () => {
    const url = `https://mainnet-gw.sodex.dev/pro/p/user/balance/list?accountId=${userId}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch spot balance: ${response.statusText}`);
    }

    const data: SpotBalanceResponse = await response.json();
    if (data.code !== 0) {
      throw new Error(`API error: Failed to fetch spot balance`);
    }

    console.log('[v0] Fetched spot balance - tokens:', data.data.spotBalance.length);
    return data.data.spotBalance || [];
  });
}

export interface MarkPrice {
  s: string; // Symbol like "BTC-USD"
  p: string; // Price
  t: number; // Timestamp
}

export interface MarkPriceResponse {
  code: number;
  data: MarkPrice[];
}

export async function fetchMarkPrices(): Promise<MarkPrice[]> {
  const cacheKey = 'markPrices';
  
  return cacheManager.deduplicate(cacheKey, async () => {
    const url = `https://mainnet-gw.sodex.dev/futures/fapi/market/v1/public/q/mark-price`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch mark prices: ${response.statusText}`);
    }

    const data: MarkPriceResponse = await response.json();
    if (data.code !== 0) {
      throw new Error(`API error: Failed to fetch mark prices`);
    }

    console.log('[v0] Fetched mark prices - count:', data.data.length);
    return data.data || [];
  });
}

// Normalize token name to match with mark prices
function normalizeTokenName(coin: string): string {
  // Remove "v" prefix
  let normalized = coin.startsWith('v') ? coin.slice(1) : coin;
  
  // Handle special cases
  if (normalized === 'SOSO' || normalized === 'WSOSO') return 'SOSO';
  if (normalized === 'MAG7.ssi') return 'MAG7';
  if (normalized === 'USDC') return 'USDC';
  
  return normalized;
}

export async function calculateTotalBalance(userId: string | number): Promise<{
  spotBalance: number;
  futuresBalance: number;
  totalBalance: number;
}> {
  const cacheKey = `totalBalance_${userId}`;
  
  return cacheManager.deduplicate(cacheKey, async () => {
    try {
      // Fetch all data in parallel
      const [accountData, spotTokens, markPrices] = await Promise.all([
        fetchAccountDetails(userId),
        fetchSpotBalance(userId),
        fetchMarkPrices(),
      ]);

      // Create a map of prices by symbol for quick lookup
      const priceMap = new Map<string, number>();
      markPrices.forEach((mp) => {
        const symbol = mp.s.split('-')[0]; // Remove "-USD" suffix
        priceMap.set(symbol, parseFloat(mp.p));
      });

      // Calculate spot balance in USD
      let spotBalanceUSD = 0;
      spotTokens.forEach((token) => {
        const normalized = normalizeTokenName(token.coin);
        const price = priceMap.get(normalized) || 1; // Default to 1 if price not found
        const amount = parseFloat(token.balance);
        spotBalanceUSD += amount * price;

        if (amount > 0) {
          console.log('[v0] Spot token:', token.coin, 'normalized:', normalized, 'amount:', amount, 'price:', price, 'usd:', amount * price);
        }
      });

      // Get futures balance (wallet balance)
      const futuresBalance = parseFloat(accountData.balances[0]?.walletBalance || '0');

      const totalBalance = spotBalanceUSD + futuresBalance;

      console.log('[v0] Balance calc - spot:', spotBalanceUSD, 'futures:', futuresBalance, 'total:', totalBalance);

      return {
        spotBalance: spotBalanceUSD,
        futuresBalance: futuresBalance,
        totalBalance: totalBalance,
      };
    } catch (err) {
      console.error('[v0] Error calculating total balance:', err);
      throw err;
    }
  });
}

export interface PnLOverviewData {
  account_id: number;
  ts_ms: number;
  cumulative_pnl: string;
  cumulative_quote_volume: string;
  unrealized_pnl: string;
}

export async function fetchPnLOverview(
  userId: string | number
): Promise<PnLOverviewData> {
  const cacheKey = `pnl_overview_${userId}`;

  return cacheManager.deduplicate(cacheKey, async () => {
    const response = await fetch(`/api/perps/pnl-overview?account_id=${userId}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch PnL overview: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.error) {
      throw new Error(result.error);
    }

    console.log('[v0] PnL overview fetched:', {
      volume: result.data.cumulative_quote_volume,
      fromCache: result.fromCache,
    });

    return result.data;
  });
}

export function getVolumeFromPnLOverview(
  pnlData: PnLOverviewData
): number {
  return parseFloat(pnlData.cumulative_quote_volume || '0');
}
