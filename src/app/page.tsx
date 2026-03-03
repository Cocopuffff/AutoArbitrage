"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type Listing = {
  id: string;
  source_url: string;
  current_price: number;
  vehicle_year: number;
  mileage_km: number;
  deal_score: number;
  dealer_description: string;
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
      // Format for recharts
      const formatted = data.map(d => ({
        date: new Date(d.recorded_at).toLocaleDateString(),
        price: d.price
      }));
      setHistory(formatted as any);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8 font-sans">
      <header className="mb-10 flex justify-between items-end border-b border-gray-800 pb-6">
        <div>
          <h1 className="text-4xl font-extrabold bg-gradient-to-r from-emerald-400 to-cyan-500 bg-clip-text text-transparent">
            AutoArbitrage Engine
          </h1>
          <p className="text-gray-400 mt-2">Real-Time High-Ticket Asset Tracker (7-Seater Arbitrage)</p>
        </div>
        <div className="text-sm font-medium text-gray-500 bg-gray-900 px-4 py-2 rounded-full border border-gray-800 shadow-inner">
          <span className="animate-pulse mr-2 text-emerald-400">●</span> Live Monitoring Active
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
                <div
                  key={l.id}
                  onClick={() => { setSelectedListing(l); fetchHistory(l.id); }}
                  className={`cursor-pointer group relative bg-gray-900 border ${selectedListing?.id === l.id ? 'border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.5)]' : 'border-gray-800'} rounded-xl p-5 hover:border-gray-600 transition duration-300 overflow-hidden`}
                >
                  {/* Score Badge */}
                  <div className="absolute top-4 right-4">
                    <div className={`text-xs font-bold px-3 py-1 rounded-full ${l.deal_score >= 85 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-800 text-gray-400'}`}>
                      {l.deal_score} SCR
                    </div>
                  </div>

                  <div className="text-xs text-gray-500 mb-1">{l.vehicle_year}</div>
                  <h3 className="text-lg font-bold truncate pr-16">{l.vehicles?.make} {l.vehicles?.model}</h3>

                  <div className="mt-4 flex items-end justify-between">
                    <div className="text-gray-300">
                      <span className="text-xs font-medium mr-1 text-gray-500">SGD</span>
                      <span className="text-2xl font-bold font-mono tracking-tight">{l.current_price.toLocaleString()}</span>
                    </div>
                    <div className="text-xs text-gray-500 italic text-right">
                      {l.mileage_km ? `${(l.mileage_km / 1000).toFixed(1)}k km` : 'N/A km'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Analytics Details Pane */}
        <section className="col-span-1 bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-2xl h-fit sticky top-8">
          <h2 className="text-xl font-semibold mb-6 flex items-center">
            <span className="bg-emerald-500 w-2 h-6 rounded mr-3"></span>
            Deal Analytics
          </h2>

          {!selectedListing ? (
            <div className="text-gray-500 text-sm text-center py-12">
              Select a listing from the board to view price trajectory and deep analytics.
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="text-sm text-gray-400">{selectedListing.vehicles?.make}</div>
                <div className="text-xl font-bold">{selectedListing.vehicles?.model} ({selectedListing.vehicle_year})</div>
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
                  {selectedListing.dealer_description || "No description provided."}
                </p>
              </div>

              <a
                href={selectedListing.source_url}
                target="_blank"
                rel="noreferrer"
                className="block w-full text-center py-3 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-semibold rounded-lg shadow-lg hover:shadow-cyan-500/25 transition-all"
              >
                Open Source Listing
              </a>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
