import 'dotenv/config';
import { ensureDatabaseReady } from './database-bootstrap';

ensureDatabaseReady().catch((error) => {
  console.error(error);
  process.exit(1);
});
