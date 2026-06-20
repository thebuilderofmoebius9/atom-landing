import { useStore } from '@nanostores/react';
import { walletAddress } from '../stores/wallet';

export default function ConnectWallet(){
  const address = useStore(walletAddress);
  async function connect(){
    const eth = window.ethereum;
    if (!eth) return alert('ไม่พบ wallet ใน browser นี้');
    const [account] = await eth.request({ method: 'eth_requestAccounts' });
    walletAddress.set(account);
  }
  return <section className="wallet card"><span className="pill">Web3 island</span><h1>Connect Wallet</h1><p>หน้านี้เป็น React island; เว็บส่วนอื่นยังเป็น static HTML.</p><button className="button" onClick={connect}>Connect Wallet</button><p className="status">{address ? `connected: ${address}` : 'ยังไม่เชื่อมต่อ'}</p></section>;
}
