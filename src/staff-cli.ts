// Manage HR/admin dashboard accounts from a terminal (also works inside the Docker container: node dist/staff-cli.js ...).
//   node dist/staff-cli.js list
//   node dist/staff-cli.js add <username> <admin|hr> "<Display Name>"     -> prints a generated password once
//   node dist/staff-cli.js reset <username>                               -> prints a new generated password once
//   node dist/staff-cli.js disable|enable <username>
import { config } from './config.js';
import { Store } from './store.js';
import { addStaff, ensureStaff, generatePassword, listStaff, setStaffDisabled, setStaffPassword } from './staff.js';

const [command, username, role, ...name] = process.argv.slice(2);
const store = new Store(process.env.DATABASE_PATH || config.DATABASE_PATH);
ensureStaff(store);
try {
  if (command === 'list') console.table(listStaff(store).map(u => ({ ...u, createdAt: new Date(u.createdAt).toISOString(), lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : '' })));
  else if (command === 'add') {
    if (role !== 'admin' && role !== 'hr') throw new Error('Role must be admin or hr');
    const password = generatePassword(); addStaff(store, username, name.join(' ') || username, role, password);
    console.log(`Created ${role} account "${username}". Password (shown once): ${password}`);
  } else if (command === 'reset') { const password = generatePassword(); setStaffPassword(store, username, password); console.log(`New password for "${username}" (shown once): ${password}`); }
  else if (command === 'disable' || command === 'enable') { setStaffDisabled(store, username, command === 'disable'); console.log(`${username} ${command}d`); }
  else console.log('Usage: staff-cli list | add <username> <admin|hr> "<Display Name>" | reset <username> | disable <username> | enable <username>');
} catch (error) { console.error(String(error instanceof Error ? error.message : error)); process.exitCode = 1; }
finally { store.close(); }
