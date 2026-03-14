import { WalletAccountEvm } from '@tetherto/wdk-wallet-evm';
import { PrivateKeySignerEvm } from '@tetherto/wdk-wallet-evm/signers';

export function initWallet() {
  const signer = new PrivateKeySignerEvm(process.env.PRIVATE_KEY);
  const account = new WalletAccountEvm(signer, {
    provider: process.env.RPC_URL,
  });
  const address = signer.address;
  console.log(`Wallet initialized: ${address}`);
  return { account, address };
}
