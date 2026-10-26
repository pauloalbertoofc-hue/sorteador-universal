// Read-only preflight. Does not create plans, subscriptions or charges.
import {verifyPlan,safeError} from './lib/mp-plan-admin.mjs';
try{
  console.log(JSON.stringify(await verifyPlan(process.env)));
  console.log('Compatibilidade verificada apenas por GET. Checkout, webhook e assinatura real ainda exigem homologação.');
}catch(error){console.error(JSON.stringify(safeError(error)));process.exitCode=1;}
