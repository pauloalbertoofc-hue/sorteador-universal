import {findPlan,safeError} from './lib/mp-plan-admin.mjs';
try{
  const result=await findPlan(process.env);
  console.log(JSON.stringify(result));
  if(result.outcome!=='found')process.exitCode=2;
}catch(error){console.error(JSON.stringify(safeError(error)));process.exitCode=1;}
