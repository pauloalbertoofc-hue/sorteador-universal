// Mercado Pago supports pending authorization with an explicit recurring schedule
// for subscriptions WITHOUT an associated preapproval_plan_id.
// Pure request builder; not wired into production until verification/binding,
// cancellation, recovery and webhook flows support planless subscriptions.
export function pendingSubscriptionRequest({userId,email,backUrl}) {
  if (!/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(userId || '')) throw Error('Invalid account');
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Invalid email');
  const u = new URL(backUrl);
  if (u.protocol !== 'https:' || u.username || u.password || u.hash) throw Error('Invalid return URL');
  return {
    reason:'Sorteador Universal Pro',
    external_reference:userId,
    payer_email:email,
    back_url:u.href,
    status:'pending',
    auto_recurring:{
      frequency:1,frequency_type:'months',
      transaction_amount:4.9,currency_id:'BRL'
    }
  };
}
