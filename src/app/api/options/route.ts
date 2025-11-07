import { getDistinctValues } from '@/lib/db';
import { NextRequest } from 'next/server';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    console.log('[API] Options route called');
    const { searchParams } = new URL(req.url);
    const selectedCountry = searchParams.get('country');
    
    console.log('[API] Getting countries and states...');
    
    // Get all countries
    const countries = getDistinctValues('country_name');
    console.log('[API] Found', countries.length, 'countries');
    
    // Get states filtered by country if specified
    const states = getDistinctValues('state_name', selectedCountry ? { country: selectedCountry } : undefined);
    console.log('[API] Found', states.length, 'states');
    return new Response(JSON.stringify({ countries, states }), { headers: { 'content-type': 'application/json' } });
  } catch (error) {
    console.error('[API] Options route error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), { 
      status: 500, 
      headers: { 'content-type': 'application/json' } 
    });
  }
}


