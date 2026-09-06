import { checkSupplyChain } from './checks/supply-chain.ts';
import { printReport } from './lib/report.ts';

// サプライチェーン関連のみを高速に検証する（pre-push / CI の最初に置く）。
const passed = printReport(checkSupplyChain());
process.exit(passed ? 0 : 1);
