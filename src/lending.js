import AaveProtocolEvm from '@tetherto/wdk-protocol-lending-aave-evm';

const USDT = process.env.USDT_ADDRESS || '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06';
const MAX_UINT256 = 2n ** 256n - 1n;

export function initLending(account) {
  return new AaveProtocolEvm(account);
}

export async function supplyToAave(aave, amount) {
  console.log(`Supplying ${amount} to Aave...`);
  const tx = await aave.supply({ token: USDT, amount });
  console.log(`Supply tx: ${tx?.hash || tx}`);
  return tx;
}

export async function withdrawFromAave(aave, amount) {
  console.log(`Withdrawing ${amount || 'ALL'} from Aave...`);
  const withdrawAmount = amount > 0n ? amount : MAX_UINT256;
  const tx = await aave.withdraw({ token: USDT, amount: withdrawAmount });
  console.log(`Withdraw tx: ${tx?.hash || tx}`);
  return tx;
}

export async function getAavePosition(aave) {
  return aave.getAccountData();
}
