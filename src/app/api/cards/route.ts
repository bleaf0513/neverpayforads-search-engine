import { NextRequest } from 'next/server';
export const runtime = 'nodejs';
import { queryCards } from '@/lib/db';

function maskCardNumber(cardNumber: string): string {
  // Show first 4 and last 4 digits, mask the middle
  if (cardNumber.length < 8) return cardNumber;
  const first4 = cardNumber.slice(0, 4);
  const last4 = cardNumber.slice(-4);
  const masked = '●'.repeat(cardNumber.length - 8);
  return `${first4}${masked}${last4}`;
}

export async function GET(req: NextRequest) {
  try {
    console.log('[API] Cards route called');
    const { searchParams } = new URL(req.url);
    const country = searchParams.get('country') || undefined;
    const state = searchParams.get('state') || undefined;
    const cardNumber = searchParams.get('cardNumber') || undefined;
    const bankName = searchParams.get('bankName') || undefined;
    const cardholder = searchParams.get('cardholder') || undefined;
    const limit = Number(searchParams.get('limit') || '25');
    const offset = Number(searchParams.get('offset') || '0');

    console.log('[API] Calling queryCards...');
    const data = queryCards({ country, state, cardNumber, bankName, cardholder, limit, offset });
    console.log('[API] queryCards returned:', data.total, 'total records');
    
    // Mask card numbers in the response
    const maskedData = {
      ...data,
      rows: data.rows.map(row => ({
        ...row,
        card_number: maskCardNumber(row.card_number)
      }))
    };
    
    console.log('[API] Returning response with', maskedData.rows.length, 'rows');
    return new Response(JSON.stringify(maskedData), { headers: { 'content-type': 'application/json' } });
  } catch (error) {
    console.error('[API] Cards route error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), { 
      status: 500, 
      headers: { 'content-type': 'application/json' } 
    });
  }
}


