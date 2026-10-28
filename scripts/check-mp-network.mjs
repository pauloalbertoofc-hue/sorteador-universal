// No credential required or sent. GET only; never dumps the response body.
import {configureAdminNetwork,networkProbe} from './lib/mp-admin-transport.mjs';
import {safeError} from './lib/mp-plan-admin.mjs';
let restore=()=>{};
try{restore=configureAdminNetwork();console.log(JSON.stringify(await networkProbe()));}
catch(error){console.error(JSON.stringify(safeError(error)));process.exitCode=1;}
finally{restore();}
