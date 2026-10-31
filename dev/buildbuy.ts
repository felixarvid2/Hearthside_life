// OWNER: UI editors agent. DEV ONLY: Buy and Build mode panels over a mock GameAPI.
// Run: npx vite --port 5185 --strictPort, then open http://localhost:5185/dev/buildbuy.html
// The page logic lives in src/ui/buy/dev/devPage.ts so the project typecheck covers it.
import { startBuildBuyDev } from '../src/ui/buy/dev/devPage';

startBuildBuyDev();
