import React from 'react';

/**
 * Terms of Use & Privacy Policy (draft for Gift Tap / Gift2u).
 * Not formal legal advice — have a lawyer review before token launch / public fundraising.
 */

const TERMS_BODY = `
Last updated: August 2026

1. Who we are
Gift Tap is an entertainment and blockchain-related game experience operated in connection with the Gift2u project ("we", "us", "Gift2u"). By creating an account, connecting a wallet, or using gift2u.fun / Gift Tap ("the Service"), you agree to these Terms of Use.

2. Entertainment only — not financial advice
The Service is provided for entertainment and experimental software purposes. Nothing in the game, website, whitepaper ("Playbook"), social media, or communications is investment advice, financial advice, legal advice, or a solicitation to buy or sell any security, commodity, or financial instrument. Descriptions of NFT "utility," swap fees, or future vault APY are game design features — not promises of profit or ROI.

3. GFT, GFTshards, and digital assets — important risk disclaimer
• GFTshards are in-game / app-tracked points used inside Gift Tap. They are not money, not a bank deposit, and not a guarantee of any future value.
• GFT credit on your account (from Shard Swap) is an in-app balance until/unless converted to an on-chain $GFT token under rules we publish. It is not a bank deposit.
• The $GFT token (if and when fully launched on-chain) is a digital asset on a public blockchain. Cryptocurrency and tokens are highly volatile and speculative.
• $GFT AND GFTSHARDS ARE NOT INVESTMENT PRODUCTS. We do not promise profits, yield, price appreciation, liquidity, or any return. Any internal design values (e.g. illustrative shard value) are not market guarantees.
• You alone are responsible for any decision to acquire, hold, trade, or sell $GFT, SOL, NFTs, or any other asset.
• WE ARE NOT RESPONSIBLE FOR PRICE CHANGES of $GFT, SOL, NFTs, or any other asset, including total loss of value.
• Past activity, roadmaps, or marketing do not guarantee future results. Token launch timing, swap rates, fees, caps, and NFT utilities may change or never occur exactly as described.

3A. NFTs (including GiftLocksmith / Gift2u Elves)
• NFTs are optional digital assets minted on Solana (e.g. Metaplex Core). They may unlock or improve in-game features such as Shard Swap access, lower swap fees, higher daily caps, or future vault benefits.
• Free players may earn GFTshards by tapping at any unlocked level without paying a wall fee. Ascension walls are optional upgrades for higher multipliers and tiers — not a closed gate to earning.
• Free players may still access Shard Swap by meeting progression requirements (e.g. Level 10+) and paying any in-app GFTshard license we require, typically with less favorable fees/caps than NFT holders.
• Holding an NFT is not a guarantee of profit, airdrop size, or secondary-market value. Supply waves, mint prices, and utilities may be adjusted for security, fairness, or operations.

3B. Shard Swap
• Shard Swap converts GFTshards into GFT (credit and/or token under then-current rules). Platform fees may apply in GFT after conversion. Daily caps and minimums may apply.
• Conversion rates may be provisional until official launch parameters are set. We may change rates, fees, and caps for abuse prevention or economic balance.

4. No guarantees about the game economy
Players may stay at a wall level (e.g. 4 or 9) and keep earning GFTshards. Climbing walls and purchasing boosts/NFTs are optional power-ups.
Energy, levels, NFTs, boosts, referrals, leaderboards, swaps, vaults, and rewards may be changed, balanced, delayed, limited, or removed. We may fix bugs, fight abuse, and adjust rates without notice when needed for security or fair play.

5. Accounts, wallets, and security
• You must keep your password and 12-word recovery phrase secret. Anyone with your phrase can control your wallet.
• We do not custody your seed phrase after you back it up. Loss of keys may mean permanent loss of access and funds — we cannot reverse blockchain transactions.
• You are responsible for all activity under your account and wallet.

6. Purchases and fees
In-app purchases (e.g. SOL for NFT mints, boosts, ascension) and swap fees may include network fees and platform fees. Blockchain transactions are generally irreversible. Refunds, if any, are at our discretion except where law requires otherwise.

7. Prohibited conduct
You may not: use bots/auto-clickers/scripts to cheat; create fake accounts for referral or reward mining (Sybil attacks); exploit bugs without reporting them; launder funds; harass others; or violate applicable law. We may suspend or ban accounts and void illegitimate rewards.

8. Third-party services
Ads, analytics, RPC providers, Supabase, Solana, wallets, and other third parties have their own terms. We are not liable for third-party outages, ads, or content.

9. Disclaimers
THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. We do not warrant uninterrupted or error-free operation.

10. Limitation of liability
TO THE MAXIMUM EXTENT PERMITTED BY LAW, GIFT2U AND ITS OPERATORS SHALL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, GOODWILL, OR DIGITAL ASSET VALUE (INCLUDING TOKEN PRICE CHANGES), WHETHER BASED ON CONTRACT, TORT, OR OTHERWISE, EVEN IF ADVISED OF THE POSSIBILITY. OUR TOTAL LIABILITY FOR ANY CLAIM RELATED TO THE SERVICE SHALL NOT EXCEED THE GREATER OF (A) AMOUNTS YOU PAID US FOR THE SERVICE IN THE 3 MONTHS BEFORE THE CLAIM OR (B) USD $50.

11. Indemnity
You agree to indemnify and hold us harmless from claims arising from your use of the Service, your wallet, your violation of these Terms, or your violation of law.

12. Changes
We may update these Terms. Continued use after changes means you accept the updated Terms. Material changes may be noted in-app or on the site when practical.

13. Contact
For questions about these Terms, contact the project via official channels listed on gift2u.fun or the official Gift2u / Gift Tap social accounts (e.g. X @Gift2udev, official Telegram).

14. Governing considerations
You are responsible for complying with laws in your jurisdiction, including crypto, tax, and gambling-related rules if they apply to you. If any part of these Terms is unenforceable, the rest remains in effect.
`.trim();

const PRIVACY_BODY = `
Last updated: July 2026

1. Overview
This Privacy Policy explains what information Gift Tap / Gift2u ("we") may collect when you use gift2u.fun and the Gift Tap game, and how we use it. Blockchain transactions are public by design.

2. Information we may collect
• Account data: username, password hash (not your plain password), player IDs, referral codes, beta access flags, game progress (shards, taps, levels, inventory, settings).
• Wallet data: public Solana addresses you use in the app; encrypted vault data you store for your in-app wallet (we do not need your seed if you only keep a local backup — follow in-app security guidance).
• Technical data: device/browser type, approximate region, logs, IP address (via hosting/CDN such as Vercel), cookies or local storage for session and preferences.
• Optional communications: messages you send us on support or social channels.
• Ads: third-party ad networks (e.g. Adsterra or others) may collect device/ad identifiers when you choose to watch ads — see their policies.

3. How we use information
• Run and improve the game and website
• Authenticate you and restore progress across devices
• Process referrals, leaderboards, and anti-fraud / anti-bot measures
• Process purchases and on-chain related features
• Communicate important updates
• Comply with law and protect security

4. Blockchain notice
Anything you send on Solana (transfers, mints, etc.) is typically public and permanent. We cannot erase the public ledger.

5. Sharing
We may share data with:
• Infrastructure providers (hosting, database, RPC, analytics)
• Ad partners when you use rewarded ads
• Law enforcement when required
• Buyers of the project if ownership changes (with notice when practical)

We do not sell your personal email list as a product; we also do not ask for unnecessary personal documents unless required for a specific legal/compliance feature in the future.

6. Retention
We keep account and game data while your account exists and as needed for security, disputes, and legal obligations. You may request account deletion by contacting official channels; some blockchain data cannot be deleted.

7. Security
We use reasonable technical measures (e.g. hashed passwords, HTTPS). No method is 100% secure. Protect your password and recovery phrase.

8. Children
The Service is not directed at children under 13 (or higher age required in your country). Do not use the Service if you are under the applicable age.

9. Your choices
• Log out; clear site data in your browser
• Avoid connecting wallets you do not control
• Contact us to correct username issues or request deletion where feasible
• Disable ads permission by not using ad-reward features

10. International users
Data may be processed in countries where our providers operate (e.g. US/EU cloud regions).

11. Changes
We may update this Policy. Continued use means you accept the updated Policy.

12. Contact
Use official Gift2u / Gift Tap channels linked from gift2u.fun.
`.trim();

const LegalModal = ({ kind, isOpen, onClose }) => {
  if (!isOpen || !kind) return null;

  const title = kind === 'privacy' ? 'Privacy Policy' : 'Terms of Use';
  const body = kind === 'privacy' ? PRIVACY_BODY : TERMS_BODY;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.9)',
        zIndex: 12000,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '20px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          background: '#1c1e22',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          borderRadius: '16px',
          border: '1px solid #333',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 18px',
            borderBottom: '1px solid #333',
            background: '#111',
            flexShrink: 0,
          }}
        >
          <h2 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: '#333',
              border: 'none',
              color: '#fff',
              width: '32px',
              height: '32px',
              minWidth: '32px',
              borderRadius: '50%',
              fontSize: '18px',
              lineHeight: 1,
              padding: 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>
        <div
          style={{
            padding: '18px',
            overflowY: 'auto',
            color: '#ccc',
            fontSize: '13px',
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
          }}
        >
          <p style={{ color: '#888', fontSize: '11px', fontStyle: 'italic', marginTop: 0 }}>
            Draft for the Gift2u / Gift Tap project. This is not a substitute for advice from a licensed attorney.
            Review before token launch or large public fundraising.
          </p>
          {body}
        </div>
      </div>
    </div>
  );
};

export default LegalModal;
