import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import giftLogo from '../components/Gift2u_logo.png';

const DailyGiftBox = ({ wallet, connection }) => {
  const [canClaim, setCanClaim] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");

  // Check if reward is ready
  useEffect(() => {
    // In the future, you'll fetch 'last_claim_ts' from the blockchain here
    const mockLastClaim = localStorage.getItem('last_claim') || 0;
    const now = Math.floor(Date.now() / 1000);
    const ONE_DAY = 86400;

    if (now - mockLastClaim >= ONE_DAY) {
      setCanClaim(true);
    } else {
      setCanClaim(false);
      // Logic for a countdown timer could go here
    }
  }, [wallet]);

  const handleClaim = async () => {
    if (!wallet) return toast.error("Connect your wallet first!");
    
    // Logic: Call your Solana Program's claim instruction here
    
    toast.success("🎁 Mystery Gift Opened! +10 GIFT");
    localStorage.setItem(`last_claim_${wallet.publicKey.toBase58()}`, Math.floor(Date.now() / 1000));
    setCanClaim(false);
  };

  return (
    <div className="mt-2 p-2 ">
      <div className={`text-7xl transition-transform ${canClaim ? " cursor-pointer hover:scale-110" : ""}`}
           onClick={canClaim ? handleClaim : null}>
        <img src={giftLogo} alt="Gift Logo" className=" h-96 object-contain rounded-2xl mix-blend-screen"/>
      </div>
      <h3 className="text-xl font-bold mb-6">{canClaim ? "Your Daily Gift Tap is Ready!" : "Next Gift Charging..."}</h3>
      <button 
        onClick={handleClaim}
        disabled={!canClaim}
        className={`w-full py-3 rounded-full font-black transition-all ${
          canClaim 
          ? "bg-gradient-to-r from-purple-600 to-pink-600 hover:scale-105 shadow-lg shadow-purple-500/20" 
          : "bg-slate-800 text-gray-500 cursor-not-allowed"
        }`}
      >
        {canClaim ? "CLAIM NOW" : "CHECK BACK LATER"}
      </button>
    </div>
  );
};

export default DailyGiftBox; // <--- This allows App.jsx to see the component