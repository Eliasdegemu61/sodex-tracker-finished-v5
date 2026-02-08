'use client'

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export interface VolumeStats {
  updated_at: string
  all_time_stats: {
    total_combined_volume: number
    total_spot_volume: number
    total_futures_volume: number
    top_5_spot: Array<{ pair: string; volume: number }>
    top_5_futures: Array<{ pair: string; volume: number }>
  }
  today_stats: {
    date: string
    top_5_spot: Array<{ pair: string; volume: number }>
    top_5_futures: Array<{ pair: string; volume: number }>
  }
}

interface TraderStats {
  totalUsers: number
  usersInProfit: number
  usersInLoss: number
}

interface DexStatusContextType {
  volumeData: VolumeStats | null
  traderStats: TraderStats | null
  isLoading: boolean
  fetchDexData: () => Promise<void>
  clearCache: () => void
}

const DexStatusContext = createContext<DexStatusContextType | undefined>(undefined)

export function DexStatusProvider({ children }: { children: ReactNode }) {
  const [volumeData, setVolumeData] = useState<VolumeStats | null>(null)
  const [traderStats, setTraderStats] = useState<TraderStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [lastFetchTime, setLastFetchTime] = useState<number | null>(null)

  const CACHE_DURATION = 10 * 60 * 1000 // 10 minutes in milliseconds

  const fetchDexData = useCallback(async () => {
    const now = Date.now()
    
    // Check if we have valid cached data (less than 10 minutes old)
    if (volumeData && traderStats && lastFetchTime && (now - lastFetchTime) < CACHE_DURATION) {
      console.log('[v0] Using cached Dex Status data (age:', Math.round((now - lastFetchTime) / 1000), 'seconds)')
      return
    }

    try {
      setIsLoading(true)

      // Fetch traders data for stats
      const tradersResponse = await fetch(
        'https://raw.githubusercontent.com/Eliasdegemu61/Sodex-Tracker-new-v1/main/live_stats.json'
      )
      if (!tradersResponse.ok) {
        throw new Error(`HTTP error! status: ${tradersResponse.status}`)
      }
      const traders: Array<{ userId: string; address: string; pnl: string; vol: string }> =
        await tradersResponse.json()

      const totalUsers = traders.length
      const usersInProfit = traders.filter((t) => parseFloat(t.pnl) > 0).length
      const usersInLoss = traders.filter((t) => parseFloat(t.pnl) < 0).length

      setTraderStats({ totalUsers, usersInProfit, usersInLoss })

      // Fetch volume data
      const volumeResponse = await fetch(
        'https://raw.githubusercontent.com/Eliasdegemu61/sodex-tracker-new-v1-data-2/main/volume_summary.json'
      )
      if (!volumeResponse.ok) {
        throw new Error(`HTTP error! status: ${volumeResponse.status}`)
      }
      const volume: VolumeStats = await volumeResponse.json()
      setVolumeData(volume)

      setLastFetchTime(now)
      console.log('[v0] Fetched fresh Dex Status data and cached for 10 minutes')
    } catch (error) {
      console.error('[v0] Error fetching Dex Status data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [volumeData, traderStats, lastFetchTime])

  const clearCache = useCallback(() => {
    setVolumeData(null)
    setTraderStats(null)
    setLastFetchTime(null)
    console.log('[v0] Cleared Dex Status cache')
  }, [])

  return (
    <DexStatusContext.Provider value={{ volumeData, traderStats, isLoading, fetchDexData, clearCache }}>
      {children}
    </DexStatusContext.Provider>
  )
}

export function useDexStatus() {
  const context = useContext(DexStatusContext)
  if (context === undefined) {
    throw new Error('useDexStatus must be used within a DexStatusProvider')
  }
  return context
}
