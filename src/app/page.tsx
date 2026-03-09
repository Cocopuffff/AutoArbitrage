"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type Listing = {
  id: string;
  source_url: string;
  current_price: number;
  vehicle_year: number | null;
  mileage_km: number | null;
  deal_score: number;
  dealer_description: string | null;
  remaining_lease: number | null;
  registration_date: string | null;
  updated_at: string;
  vehicles: {
    make: string;
    model: string;
  };
};

type PriceHistory = {
  price: number;
  recorded_at: string;
};

// Extracted analytics panel so it can be rendered inline (mobile) or in sidebar (desktop)
function AnalyticsPanel({
  listing,
  history,
  onDismiss,
}: {
  listing: Listing;
  history: PriceHistory[];
  onDismiss?: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-gray-400">{listing.vehicles?.make}</div>
          <div className="text-xl font-bold">{listing.vehicles?.model}{listing.vehicle_year ? ` (${listing.vehicle_year})` : null}</div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-gray-500 hover:text-gray-300 transition p-1 -mt-1 -mr-1"
            aria-label="Close analytics"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>

      <div className="h-64 mt-4 bg-gray-950 p-4 rounded-lg border border-gray-800">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} />
            <YAxis domain={['auto', 'auto']} stroke="#94a3b8" fontSize={12} tickLine={false} tickFormatter={(val) => `$${val / 1000}k`} />
            <Tooltip<number, string>
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }}
              itemStyle={{ color: '#34d399' }}
              formatter={(value) => [`$${(value || 0).toLocaleString()}`, 'Price']}
            />
            <Line type="monotone" dataKey="price" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 6, fill: '#34d399' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">AI Extracted Context</h4>
        <p className="text-sm text-gray-300 leading-relaxed bg-gray-950 p-4 rounded-lg border border-gray-800 max-h-48 overflow-y-auto">
          {listing.dealer_description || "No description provided."}
        </p>
      </div>

      <a
        href={listing.source_url}
        target="_blank"
        rel="noreferrer"
        className="block w-full text-center py-3 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-semibold rounded-lg shadow-lg hover:shadow-cyan-500/25 transition-all"
      >
        Open Source Listing
      </a>
    </div>
  );
}

export default function Dashboard() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [history, setHistory] = useState<PriceHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchListings();
  }, []);

  async function fetchListings() {
    setLoading(true);
    const { data, error } = await supabase
      .from('listings')
      .select('*, vehicles(make, model)')
      .eq('status', 'ACTIVE')
      .order('deal_score', { ascending: false });

    if (data) setListings(data);
    setLoading(false);
  }

  async function fetchHistory(listingId: string) {
    const { data, error } = await supabase
      .from('price_history')
      .select('*')
      .eq('listing_id', listingId)
      .order('recorded_at', { ascending: true });

    if (data) {
      const formatted = data.map(d => ({
        date: new Date(d.recorded_at).toLocaleDateString(),
        price: d.price
      }));
      setHistory(formatted as any);
    }
  }

  function handleSelectListing(listing: Listing) {
    if (selectedListing?.id === listing.id) {
      // Tapping the same card again dismisses on mobile
      setSelectedListing(null);
      setHistory([]);
    } else {
      setSelectedListing(listing);
      fetchHistory(listing.id);
    }
  }

  function handleDismiss() {
    setSelectedListing(null);
    setHistory([]);
  }

  const isLive = listings.length > 0 && 
                 (new Date().getTime() - Math.max(...listings.map(l => new Date(l.updated_at).getTime()))) < (6.5 * 60 * 60 * 1000);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 sm:p-8 font-sans">
      <header className="mb-6 sm:mb-10 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 border-b border-gray-800 pb-4 sm:pb-6">
        <div>
          <h1 className="text-2xl sm:text-4xl font-extrabold bg-gradient-to-r from-emerald-400 to-cyan-500 bg-clip-text text-transparent">
            AutoArbitrage Engine
          </h1>
          <p className="text-gray-400 mt-1 sm:mt-2 text-sm sm:text-base">Real-Time High-Ticket Asset Tracker (7-Seater Arbitrage)</p>
        </div>
        <div className="text-xs sm:text-sm font-medium text-gray-500 bg-gray-900 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-gray-800 shadow-inner w-fit">
          {isLive ? (
            <><span className="animate-pulse mr-2 text-emerald-400">●</span> Live</>
          ) : (
            <><span className="mr-2 text-red-500">●</span> Inactive</>
          )}
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Listings Data Grid */}
        <section className="col-span-1 lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold border-l-4 border-emerald-500 pl-3">Market Opportunities</h2>
            <button
              onClick={fetchListings}
              className="text-sm bg-gray-800 hover:bg-gray-700 transition px-4 py-2 rounded-md shadow-sm border border-gray-700"
            >
              Refresh Data
            </button>
          </div>

          {loading ? (
            <div className="animate-pulse flex space-x-4 h-32 bg-gray-900 rounded-xl p-6 border border-gray-800"></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {listings.map((l) => (
                <div key={l.id}>
                  {/* Listing Card */}
                  <div
                    onClick={() => handleSelectListing(l)}
                    className={`cursor-pointer group relative bg-gray-900 border ${selectedListing?.id === l.id ? 'border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.5)]' : 'border-gray-800'} rounded-xl p-5 hover:border-gray-600 transition duration-300 overflow-hidden`}
                  >
                    {/* Score Badge */}
                    <div className="absolute top-4 right-4">
                      <div className={`text-xs font-bold px-3 py-1 rounded-full ${l.deal_score >= 85 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-800 text-gray-400'}`}>
                        {l.deal_score} Score
                      </div>
                    </div>

                    <div className="text-xs text-gray-500 mb-1">{l.vehicle_year}</div>
                    <h3 className="text-lg font-bold truncate pr-16">{l.vehicles?.make} {l.vehicles?.model}</h3>

                    <div className="mt-4 flex items-end justify-between">
                      <div className="text-gray-300">
                        <span className="text-xs font-medium mr-1 text-gray-500">SGD</span>
                        <span className="text-2xl font-bold font-mono tracking-tight">{l.current_price.toLocaleString()}</span>
                      </div>
                      <div className="text-xs text-gray-500 italic text-right space-y-1">
                        <div>{l.mileage_km ? `${(l.mileage_km / 1000).toFixed(0)}k km` : 'N/A km'}</div>
                        {l.remaining_lease !== null && l.remaining_lease > 0 && (
                          <div className="text-emerald-500/80">
                            {l.remaining_lease && l.remaining_lease > 0 && `${l.remaining_lease}y `}
                            COE
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Mobile Inline Analytics — shown directly below the selected card */}
                  {selectedListing?.id === l.id && (
                    <div className="lg:hidden mt-4 bg-gray-900 border border-cyan-500/30 rounded-xl p-4 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold flex items-center">
                          <span className="bg-emerald-500 w-2 h-5 rounded mr-3"></span>
                          Deal Analytics
                        </h2>
                      </div>
                      <AnalyticsPanel listing={selectedListing} history={history} onDismiss={handleDismiss} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Desktop Sidebar Analytics Pane — hidden on mobile */}
        <section className="hidden lg:block col-span-1 bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-2xl h-fit lg:sticky lg:top-8">
          <h2 className="text-xl font-semibold mb-6 flex items-center">
            <span className="bg-emerald-500 w-2 h-6 rounded mr-3"></span>
            Deal Analytics
          </h2>

          {!selectedListing ? (
            <div className="text-gray-500 text-sm text-center py-12">
              Select a listing from the board to view price trajectory and deep analytics.
            </div>
          ) : (
            <AnalyticsPanel listing={selectedListing} history={history} />
          )}
        </section>
      </main>
    </div>
  );
}
