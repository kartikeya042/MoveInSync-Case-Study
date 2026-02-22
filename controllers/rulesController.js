import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const getRulesConfig = (_req, res) => {
  try {
    // re-read on each request so an admin can update the file without restarting the server
    const rules = JSON.parse(readFileSync(join(__dirname, '../rules.json'), 'utf-8'));
    return res.status(200).json(rules);
  } catch (err) {
    // if the file is missing or malformed json, surface it clearly rather than a generic 500
    console.error('failed to read rules.json:', err);
    return res.status(500).json({ error: 'could not load rules config' });
  }
};
